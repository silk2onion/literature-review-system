import pytest
from unittest.mock import MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base
from app.services.crawler.multi_source_orchestrator import MultiSourceOrchestrator
from app.services.embedding_service import EmbeddingService

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def db():
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # Import models to ensure they are registered with Base.metadata
    from app import models  # noqa: F401
    
    print(f"Tables to create: {Base.metadata.tables.keys()}")
    Base.metadata.create_all(bind=engine)
    
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def mock_orchestrator():
    orchestrator = MagicMock(spec=MultiSourceOrchestrator)
    return orchestrator

@pytest.fixture(scope="function")
def mock_embedding_service():
    service = MagicMock(spec=EmbeddingService)
    return service