from datetime import datetime
from pydantic import BaseModel, ConfigDict


class LogEntry(BaseModel):
    """Base schema for inbound log payloads."""
    timestamp: datetime
    level: str
    service: str
    message: str | None = None
    response_time_ms: float
    status_code: int


class LogRecordCreate(LogEntry):
    """Request schema for creating a new log record."""
    pass


class LogRecordResponse(LogEntry):
    """Response schema returned after model inference and persistence."""
    id: int
    is_anomaly: bool
    anomaly_score: float
    ground_truth: bool | None = None
    source: str = "api"

    model_config = ConfigDict(from_attributes=True)


# Backwards-compatible aliases
LogResponse = LogRecordResponse