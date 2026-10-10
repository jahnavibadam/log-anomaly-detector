import argparse
import csv
import hashlib
from datetime import datetime
from pathlib import Path

import models
from database import Base, SessionLocal, engine, migrate_schema
from predictor import predict_many

DEFAULT_CSV = Path(__file__).resolve().parent.parent / "data" / "logs.csv"
REQUIRED_COLUMNS = {
    "timestamp",
    "level",
    "service",
    "message",
    "response_time_ms",
    "status_code",
    "is_anomaly",
}


def parse_ground_truth(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError(f"Expected True or False for is_anomaly, got {value!r}")


def import_csv(csv_path: Path) -> int:
    content = csv_path.read_bytes()
    checksum = hashlib.sha256(content).hexdigest()

    Base.metadata.create_all(bind=engine)
    migrate_schema()

    with SessionLocal() as db:
        if db.get(models.DatasetImport, checksum):
            print(f"Already imported this exact CSV: {csv_path}")
            return 0

        payloads = []
        ground_truth_values = []
        with csv_path.open("r", newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            columns = set(reader.fieldnames or [])
            missing_columns = REQUIRED_COLUMNS - columns
            if missing_columns:
                raise ValueError(
                    "CSV is missing required columns: "
                    + ", ".join(sorted(missing_columns))
                )

            for line_number, row in enumerate(reader, start=2):
                try:
                    payload = {
                        "timestamp": datetime.fromisoformat(row["timestamp"].strip()),
                        "level": row["level"].strip(),
                        "service": row["service"].strip(),
                        "message": row["message"].strip(),
                        "response_time_ms": float(row["response_time_ms"]),
                        "status_code": int(row["status_code"]),
                    }
                    ground_truth = parse_ground_truth(row["is_anomaly"])
                except (KeyError, TypeError, ValueError) as exc:
                    raise ValueError(f"Invalid CSV data on line {line_number}: {exc}") from exc

                payloads.append(payload)
                ground_truth_values.append(ground_truth)

        predictions = predict_many(payloads)
        rows_to_add = [
            models.LogRecord(
                **payload,
                is_anomaly=predicted_anomaly,
                anomaly_score=anomaly_score,
                ground_truth=ground_truth,
                source="simulator",
            )
            for payload, ground_truth, (predicted_anomaly, anomaly_score) in zip(
                payloads, ground_truth_values, predictions, strict=True
            )
        ]

        db.add_all(rows_to_add)
        db.add(
            models.DatasetImport(
                checksum=checksum,
                source_path=str(csv_path.resolve()),
                imported_count=len(rows_to_add),
            )
        )
        db.commit()

    return len(rows_to_add)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import simulator logs into SQLite and run model predictions."
    )
    parser.add_argument(
        "csv_path",
        nargs="?",
        type=Path,
        default=DEFAULT_CSV,
        help=f"CSV file to import (default: {DEFAULT_CSV})",
    )
    args = parser.parse_args()

    if not args.csv_path.is_file():
        parser.error(f"CSV file does not exist: {args.csv_path}")

    count = import_csv(args.csv_path)
    if count:
        print(f"Imported {count:,} simulator rows into the database.")


if __name__ == "__main__":
    main()
