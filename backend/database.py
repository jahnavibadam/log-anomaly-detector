from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# Database Connection URL (SQLite database stored in backend/)
SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"

# Engine Creation
# Gotcha: connect_args={"check_same_thread": False} is required for SQLite in FastAPI
# because request handlers run on different threads.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

# Session Factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base Class
Base = declarative_base()


def migrate_schema() -> None:
    """Apply additive SQLite changes needed by the current log-record model."""
    with engine.begin() as connection:
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("log_records")
        }
        if "ground_truth" not in columns:
            connection.execute(
                text("ALTER TABLE log_records ADD COLUMN ground_truth BOOLEAN")
            )
        if "source" not in columns:
            connection.execute(
                text("ALTER TABLE log_records ADD COLUMN source VARCHAR NOT NULL DEFAULT 'api'")
            )


# Database Session Dependency Generator
def get_db() -> Generator[Session, None, None]:
    """Yield a database session per request and ensure cleanup afterward."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()