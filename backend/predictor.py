import os
from typing import Any

import joblib
import pandas as pd

# -------------------------------------------------------------------------
# CONSTANTS & CONFIGURATION
# -------------------------------------------------------------------------
# Exact column order expected by the trained StandardScaler / IsolationForest
FEATURE_COLUMNS = [
    "response_time_ms",
    "status_code",
    "hour_of_day",
    "level_encoded",
    "service_encoded",
]

# Path to model artifacts directory
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_pickle(filename: str):
    """Load a model artifact with a clear error if the file is missing."""
    path = os.path.join(MODEL_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Model artifact not found: {path}")
    return joblib.load(path)


# -------------------------------------------------------------------------
# MODULE-LEVEL LOADING (Loaded once at import, not per request)
# -------------------------------------------------------------------------
scaler = _load_pickle("scaler.pkl")
model = _load_pickle("model.pkl")
level_encoder = _load_pickle("level_encoder.pkl")
service_encoder = _load_pickle("service_encoder.pkl")


def _encode_category(encoder, value: Any) -> int:
    """Safely encode a category using a fitted LabelEncoder."""
    if value is None:
        return -1

    category = str(value).strip()
    if category == "":
        return -1

    if category in encoder.classes_:
        return int(encoder.transform([category])[0])

    return -1


def _build_feature_row(payload: dict) -> dict:
    required_fields = ["timestamp", "response_time_ms", "status_code", "level", "service"]
    missing = [field for field in required_fields if field not in payload]
    if missing:
        raise ValueError(f"Missing required payload fields: {', '.join(missing)}")

    try:
        timestamp = pd.to_datetime(payload["timestamp"])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid timestamp value: {payload.get('timestamp')!r}") from exc
    if pd.isna(timestamp):
        raise ValueError(f"Invalid timestamp value: {payload.get('timestamp')!r}")

    try:
        response_time_ms = float(payload["response_time_ms"])
        status_code = int(payload["status_code"])
    except (TypeError, ValueError) as exc:
        raise ValueError("response_time_ms and status_code must be numeric values") from exc

    return {
        "response_time_ms": response_time_ms,
        "status_code": status_code,
        "hour_of_day": timestamp.hour,
        "level_encoded": _encode_category(level_encoder, payload.get("level")),
        "service_encoded": _encode_category(service_encoder, payload.get("service")),
    }


def predict_many(payloads: list[dict]) -> list[tuple[bool, float]]:
    """Score many payloads together to avoid one model invocation per row."""
    if not payloads:
        return []

    rows = [_build_feature_row(payload) for payload in payloads]
    df_features = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
    X_scaled = scaler.transform(df_features)
    raw_predictions = model.predict(X_scaled)
    raw_scores = model.decision_function(X_scaled)
    return [
        (bool(raw_prediction == -1), float(raw_score))
        for raw_prediction, raw_score in zip(raw_predictions, raw_scores, strict=True)
    ]


def predict(payload: dict) -> tuple[bool, float]:
    """Evaluate an incoming log payload and determine whether it is anomalous."""
    return predict_many([payload])[0]