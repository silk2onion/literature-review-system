import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import CrawlJob, Paper, Review
from app.services.crawl_service import run_crawl_job_once, retry_crawl_job
from app.services.review import generate_review
from app.schemas.review import ReviewGenerate
from app.services.crawler.arxiv_crawler import ArxivCrawler
from app.services.llm.openai_service import OpenAIService

# Setup database fixture
@pytest.fixture(scope="module")
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)

def test_crawl_network_error(db: Session):
    """
    Test that a network error during crawling marks the job as failed and logs the error.
    """
    # Create a dummy crawl job
    job = CrawlJob(
        keywords=["network_error_test"],
        sources=["arxiv"],
        status="pending",
        max_results=10
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    # Mock ArxivCrawler.search to raise an exception
    # We need to patch where it's used. In run_crawl_job_once, it calls search_across_sources
    # which instantiates ArxivCrawler.
    
    with patch("app.services.crawler.arxiv_crawler.ArxivCrawler.search", side_effect=Exception("Simulated Network Error")):
        with pytest.raises(Exception) as excinfo:
            run_crawl_job_once(db, int(job.id))
        
        assert "Simulated Network Error" in str(excinfo.value)

    # Verify job status
    db.refresh(job)
    assert str(job.status) == "failed"
    assert job.failed_count == 1
    
    # Verify log
    logs = job.log.get("entries", [])
    assert len(logs) > 0
    assert "Simulated Network Error" in logs[-1]["msg"]

@pytest.mark.asyncio
async def test_llm_timeout(db: Session):
    """
    Test that an LLM timeout is handled gracefully (or raises appropriate error).
    """
    # Create a dummy review request
    payload = ReviewGenerate(
        keywords=["llm_timeout_test"],
        paper_ids=[], # No papers needed for this test if we mock the LLM
    )

    # Mock OpenAIService.generate_review_framework to raise a TimeoutError (or similar)
    # We need to patch the method on the instance or the class.
    # Since generate_review instantiates OpenAIService internally (or via dependency injection),
    # we might need to patch the class method.
    
    with patch("app.services.llm.openai_service.OpenAIService.generate_lit_review", side_effect=Exception("Simulated LLM Timeout")):
        # The generate_review service catches exceptions and returns a failed response object
        response = await generate_review(db, payload)
        
        assert response.success is False
        assert response.message is not None
        assert "Simulated LLM Timeout" in response.message
        assert response.status == "failed"

def test_crawl_retry(db: Session):
    """
    Test that a failed crawl job can be retried, resetting its status and counters.
    """
    # Create a failed crawl job
    job = CrawlJob(
        keywords=["retry_test"],
        sources=["arxiv"],
        status="failed",
        max_results=10,
        fetched_count=5,
        failed_count=1,
        current_page=1
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    # Call retry logic
    retried_job = retry_crawl_job(db, int(job.id))

    # Verify status reset
    assert str(retried_job.status) == "pending"
    assert retried_job.fetched_count == 0
    assert retried_job.failed_count == 0
    assert retried_job.current_page == 0
    
    # Verify log entry added
    logs = retried_job.log.get("entries", [])
    assert len(logs) > 0
    assert "retry" in logs[-1]["msg"]
