# Log Anomaly Detection System

A full-stack machine learning system that detects anomalous behaviour in application logs using an Isolation Forest model. Built as a portfolio project to bridge software engineering experience with practical ML engineering.

---

## Project motivation

At NatWest Group, monitoring hundreds of servers and applications using Splunk dashboards involved manually configuring alerts and visually spotting unusual patterns. This project replicates and extends that capability by building a custom ML pipeline from scratch — one that learns what "normal" looks like and automatically flags deviations, without relying on hand-crafted rules.

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | Python 3.14 |
| ML | scikit-learn (Isolation Forest) |
| API | FastAPI |
| Database | SQLite via SQLAlchemy |
| Frontend | React.js + Vite |
| Visualisation | Recharts |
| Notebook | Jupyter (via VS Code) |
| Model persistence | joblib |
| Version control | Git + GitHub |

---

## Project structure

```
log-anomaly-detector/
├── backend/
│   ├── model.pkl               # Trained Isolation Forest model
│   ├── scaler.pkl              # Fitted StandardScaler
│   ├── level_encoder.pkl       # LabelEncoder for log level
│   ├── service_encoder.pkl     # LabelEncoder for service name
│   ├── database.py             # SQLite setup and table definitions
│   ├── models.py               # Pydantic request/response models
│   ├── predictor.py            # Loads pkl files, runs predictions
│   └── main.py                 # FastAPI app and endpoints
├── data/
│   └── logs.csv                # Generated synthetic log dataset (10,000 rows)
├── notebooks/
│   ├── log-simulator.ipynb     # Phase A: synthetic data generation
│   ├── eda.ipynb               # Phase B: exploratory data analysis
│   └── model.ipynb             # Phase B: feature engineering + model training
├── frontend/
│   ├── src/                    # React components
│   ├── public/
│   └── package.json
├── venv/                       # Python virtual environment
└── README.md
```

---

## Phases completed

### Phase A — Log simulator (`notebooks/log-simulator.ipynb`)

Built a Python script to generate a realistic synthetic log dataset of 10,000 entries, saved to `data/logs.csv`.

**Design decisions:**

- **90/10 normal/anomaly split** — reflects realistic production log distributions where anomalies are rare events
- **Log level is independent of anomaly status** — generated using weighted random sampling (`INFO: 70%, WARNING: 20%, ERROR: 8%, CRITICAL: 2%`) regardless of whether the entry is anomalous. This forces the model to learn from numeric patterns rather than taking a shortcut on the level field
- **Overlapping response times and status codes** — normal logs have response times of 50–800ms and anomalous logs have 600–9000ms (intentional overlap at 600–800ms). Similarly, normal logs occasionally produce 500/503 status codes and anomalous logs occasionally return 200. This makes the classification task genuinely non-trivial
- **Timestamps spread over 30 days** — sorted chronologically so the dataset resembles a real log file
- **`is_anomaly` ground truth label** — stored in the CSV for evaluation purposes only; never used as a training feature

**Generated columns:**

| Column | Description | Example |
|---|---|---|
| `timestamp` | Datetime over 30-day window | `2024-07-15 03:42:11` |
| `level` | Log level (weighted random) | `INFO` |
| `service` | Source microservice | `payment-service` |
| `message` | Log message text | `Connection timeout after 4821ms` |
| `response_time_ms` | Request duration in ms | `4821` |
| `status_code` | HTTP response code | `500` |
| `is_anomaly` | Ground truth label | `True` |

**Services simulated:** `payment-service`, `auth-service`, `api-gateway`, `inventory-service`, `notification-service`

---

### Phase B — EDA (`notebooks/eda.ipynb`)

Exploratory analysis to validate the generated dataset before training.

**Key findings:**
- Actual anomaly split: 9,023 normal / 977 anomalous (9.77% anomaly rate — close to the 10% target)
- Mean response time: ~849ms, median: ~465ms — the gap confirms anomalies are pulling the average up
- Status code distribution confirms overlap: 7,785 × 200, 882 × 201, with a small number of 5xx codes in normal entries and 200s in anomalous entries
- Response time distributions visually confirmed as bimodal — two distinct humps for normal vs anomalous, with intentional overlap in the middle

---

### Phase B — Feature engineering + model training (`notebooks/model.ipynb`)

**Features used (final model):**

| Feature | Type | Notes |
|---|---|---|
| `response_time_ms` | Numeric | Core anomaly signal — already numeric |
| `status_code` | Numeric | Core anomaly signal — already numeric |
| `hour_of_day` | Numeric | Extracted from timestamp via `dt.hour` — adds time-of-day context |
| `level_encoded` | Encoded | `LabelEncoder` on INFO/WARNING/ERROR/CRITICAL |
| `service_encoded` | Encoded | `LabelEncoder` on 5 service names |

**Features explored but not used:**

- **TF-IDF on message text** — added 20 word-frequency columns. Recall dropped from 83% to 30%. Root cause: synthetic messages are too repetitive (~12 unique templates), so TF-IDF adds 20 noisy dimensions that confuse the model (curse of dimensionality). Would perform better on a real dataset with varied natural language messages.
- **Rolling event count (5-minute window)** — count of log entries in the preceding 5 minutes. Recall dropped slightly from 83% to 80%. Root cause: synthetic timestamps are randomly distributed across 30 days with no genuine burst patterns. Would be a strong signal on real production data where incidents cause actual spikes.

**Encoding approach:**

`level` and `service` were encoded using `LabelEncoder` (not one-hot encoding). Isolation Forest is not a linear model and doesn't need one-hot encoding — ordinal integers work fine and keep dimensionality low.

**Scaling:**

All features scaled using `StandardScaler` (mean=0, std=1) before training. Critical because `response_time_ms` (50–9000) and `level_encoded` (0–3) are on completely different scales — without scaling, response time would dominate and the model would effectively ignore the other features.

**Model: Isolation Forest**

Isolation Forest is an unsupervised anomaly detection algorithm. It builds an ensemble of random decision trees and measures how many splits are needed to isolate each data point. Normal points cluster together and require many splits to isolate; anomalies are outliers and get isolated quickly. The anomaly score reflects this — lower scores = more anomalous.

Chosen because:
- Unsupervised — no need to label training data
- Scales well to tabular data
- Produces a continuous anomaly score, not just a binary flag
- Industry-standard choice for log/metric anomaly detection

**Final model parameters:**

```python
IsolationForest(
    contamination=0.12,   # expected anomaly rate — slightly above 10% to account for overlap
    n_estimators=200,     # more trees = more stable predictions
    max_samples=512,      # samples per tree
    random_state=42       # reproducibility
)
```

**Recall progression through tuning:**

| Version | Recall | Change |
|---|---|---|
| Baseline (4 features, default params) | 69% | — |
| + tuned contamination/n_estimators/max_samples | 76% | +7% |
| + hour_of_day feature | 83% | +7% |
| + rolling_event_count | 80% | -3% (removed) |
| + TF-IDF (20 features) | 30% | -53% (removed) |
| **Final model** | **83%** | — |

**Evaluation note:**

No train/test split was used because Isolation Forest is unsupervised — it never sees the `is_anomaly` label during training, so the standard supervised learning concern (memorising labels) does not apply. The classification report is a post-hoc sanity check comparing the model's notion of "anomalous" against the ground truth labels. In production, recall on truly unseen logs would likely be slightly lower.

**Final confusion matrix:**

```
Predicted:    Normal   Anomaly
Actual Normal  8636      387     ← 387 false alarms
Actual Anomaly  164      813     ← caught 813 of 977 real anomalies
```

**Model artifacts saved via joblib:**

- `backend/model.pkl` — trained Isolation Forest
- `backend/scaler.pkl` — fitted StandardScaler
- `backend/level_encoder.pkl` — fitted LabelEncoder for log level
- `backend/service_encoder.pkl` — fitted LabelEncoder for service name

---

## Setup instructions

### Prerequisites

- macOS with Homebrew installed
- Python 3.11+ (`brew install python`)
- Node.js 20 LTS (`brew install node`)
- Git (`brew install git`)

### Backend setup

```bash
git clone https://github.com/<your-username>/log-anomaly-detector.git
cd log-anomaly-detector
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Start the backend and import simulator logs

Run these commands after the model artifacts have been generated in `backend/`.

```bash
cd backend
python import_logs.py
python -m uvicorn main:app --reload --port 8000
```

The importer reads `data/logs.csv`, scores each row with the trained model, and keeps
the simulator's `is_anomaly` label separately as `ground_truth`. It records a checksum
for the imported file, so running the same import command again will not duplicate rows.
The API offers `GET /logs` and `GET /anomalies` with `skip`, `limit`, and `search`
parameters, plus `GET /stats` for aggregate counts.

### Start the frontend

In a separate terminal from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). The dashboard pages through the
API records 50 at a time; simulator ground truth and model prediction are shown
separately.

### Regenerate the dataset (optional)

```bash
cd notebooks
jupyter notebook
# Open log-simulator.ipynb and run all cells
```

### Retrain the model (optional)

```bash
# Open notebooks/model.ipynb and run all cells
# pkl files will be saved to backend/
```

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

---

## Implemented application

- FastAPI ingestion and prediction backed by SQLite
- CSV import that preserves simulator ground truth separately from predictions
- Searchable, paginated React dashboard for logs and anomalies

### V2 upgrades
- Docker + Docker Compose containerisation
- Replace SQLite with PostgreSQL
- Deploy to AWS (EC2 or ECS)
- GitHub Actions CI/CD pipeline
- MLflow experiment tracking
- Kafka for real-time log streaming
- Swap synthetic dataset for `web_log_anomaly_dataset.csv` (15,000 rows, 4 anomaly types, richer features)
- LSTM Autoencoder as a second model for comparison

---

## Interview talking points

**Why Isolation Forest?**
It's unsupervised — no labelling required, which is realistic for log monitoring where you rarely have labelled anomaly data. It produces a continuous score rather than just a binary flag, which allows severity ranking. And it's interpretable — you can explain the algorithm conceptually without a PhD.

**Why did TF-IDF hurt recall?**
Adding high-dimensional sparse features to an Isolation Forest causes the curse of dimensionality — the algorithm struggles to find meaningful isolation paths when there are too many dimensions. The fix for a real dataset would be dimensionality reduction (PCA on the TF-IDF matrix) before concatenating with the numeric features.

**Why no train/test split?**
Isolation Forest is unsupervised — it never sees the anomaly labels during training, so there's nothing to memorise. The evaluation is a post-hoc comparison against ground truth, not a test of generalisation.

**What would you do differently with real data?**
Add rolling event counts and time-since-last-event features — they'd carry real signal with genuine burst patterns. Use TF-IDF with PCA. Introduce a feedback loop where flagged anomalies get human labels and feed into a supervised model over time.
