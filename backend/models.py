from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from database import Base


class LogRecord(Base):
    __tablename__ = "log_records"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    level = Column(String, nullable=False)
    service = Column(String, nullable=False)
    message = Column(String, nullable=True, default="")
    response_time_ms = Column(Float, nullable=False)
    status_code = Column(Integer, nullable=False)

    # ML Prediction fields
    is_anomaly = Column(Boolean, nullable=False, default=False, index=True)
    anomaly_score = Column(Float, nullable=False)
    ground_truth = Column(Boolean, nullable=True)
    source = Column(String, nullable=False, default="api")


class DatasetImport(Base):
    __tablename__ = "dataset_imports"

    checksum = Column(String, primary_key=True)
    source_path = Column(String, nullable=False)
    imported_count = Column(Integer, nullable=False)