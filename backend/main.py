from fastapi import FastAPI, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import String, cast, desc, func, or_

import models
import schemas
from database import engine, get_db, migrate_schema
from predictor import predict

# Ensure database tables exist upon startup
models.Base.metadata.create_all(bind=engine)
migrate_schema()

app = FastAPI(title="Log Anomaly Detection Service")

# -------------------------------------------------------------------------
# CORS CONFIGURATION
# -------------------------------------------------------------------------
origins = [
    "http://localhost:5173",  # Vite dev server origin
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------------------------
# ROUTES
# -------------------------------------------------------------------------
@app.post(
    "/logs",
    response_model=schemas.LogRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_log(payload: schemas.LogRecordCreate, db: Session = Depends(get_db)):
    """
    Validates log payload, predicts anomaly score, saves record to DB, and returns it.
    """
    # 1. Convert Pydantic model to dictionary for the model predictor
    log_dict = payload.model_dump()
    log_dict["message"] = log_dict.get("message") or ""

    # 2. Run IsolationForest prediction
    is_anomaly, anomaly_score = predict(log_dict)

    # 3. Construct ORM object with prediction results attached
    db_log = models.LogRecord(
        **log_dict,
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
    )

    # 4. Commit to database and refresh instance
    db.add(db_log)
    db.commit()
    db.refresh(db_log)

    return db_log


@app.get("/logs", response_model=list[schemas.LogRecordResponse])
def read_logs(
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=1000, description="Max rows to return"),
    search: str | None = Query(None, max_length=200, description="Search log fields"),
    db: Session = Depends(get_db),
):
    """
    Fetches paginated log records ordered by timestamp descending.
    """
    query = db.query(models.LogRecord)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.LogRecord.service.ilike(term),
                models.LogRecord.level.ilike(term),
                models.LogRecord.message.ilike(term),
                cast(models.LogRecord.id, String).ilike(term),
                cast(models.LogRecord.status_code, String).ilike(term),
            )
        )
    logs = (
        query
        .order_by(desc(models.LogRecord.timestamp))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return logs


@app.get("/anomalies", response_model=list[schemas.LogRecordResponse])
def read_anomalies(
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=1000, description="Max rows to return"),
    search: str | None = Query(None, max_length=200, description="Search anomaly fields"),
    db: Session = Depends(get_db),
):
    """
    Fetches paginated anomalous log records (is_anomaly == True) ordered by timestamp descending.
    """
    query = db.query(models.LogRecord).filter(models.LogRecord.is_anomaly.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.LogRecord.service.ilike(term),
                models.LogRecord.level.ilike(term),
                models.LogRecord.message.ilike(term),
                cast(models.LogRecord.id, String).ilike(term),
                cast(models.LogRecord.status_code, String).ilike(term),
            )
        )
    anomalies = (
        query
        .order_by(desc(models.LogRecord.timestamp))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return anomalies


@app.get("/stats")
def read_stats(
    search: str | None = Query(None, max_length=200, description="Search log fields"),
    db: Session = Depends(get_db),
):
    """Return aggregate counts for dashboard cards across the complete dataset."""
    total_logs, predicted_anomalies, average_response = db.query(
        func.count(models.LogRecord.id),
        func.coalesce(
            func.sum(models.LogRecord.is_anomaly.cast(models.Integer)), 0
        ),
        func.coalesce(func.avg(models.LogRecord.response_time_ms), 0),
    ).one()
    matching_query = db.query(models.LogRecord)
    if search and search.strip():
        term = f"%{search.strip()}%"
        matching_query = matching_query.filter(
            or_(
                models.LogRecord.service.ilike(term),
                models.LogRecord.level.ilike(term),
                models.LogRecord.message.ilike(term),
                cast(models.LogRecord.id, String).ilike(term),
                cast(models.LogRecord.status_code, String).ilike(term),
            )
        )
    matching_logs = matching_query.count()
    matching_anomalies = matching_query.filter(
        models.LogRecord.is_anomaly.is_(True)
    ).count()
    return {
        "total_logs": total_logs,
        "predicted_anomalies": predicted_anomalies,
        "average_response_time_ms": float(average_response),
        "matching_logs": matching_logs,
        "matching_anomalies": matching_anomalies,
    }