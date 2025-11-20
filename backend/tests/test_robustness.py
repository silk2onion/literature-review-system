import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.services.crawler.multi_source_orchestrator import MultiSourceOrchestrator
from app.services.crawler.base_crawler import CrawlerError
from app.services.llm.openai_service import OpenAIService
from app.models.paper import Paper
from app.schemas.review import ReviewGenerateResponse, ReviewStatus

# Mock dependencies
@pytest.fixture
def mock_orchestrator_instance():
    orchestrator = MagicMock(spec=MultiSourceOrchestrator)
    return orchestrator

@pytest.fixture
def mock_openai_service_instance():
    service = MagicMock(spec=OpenAIService)
    return service

@pytest.fixture
def client(db, mock_orchestrator_instance, mock_openai_service_instance):
    # Override dependencies
    app.dependency_overrides = {} 
    
    with patch("app.services.crawl_service.orchestrator", mock_orchestrator_instance), \
         patch("app.api.reviews.OpenAIService", return_value=mock_openai_service_instance), \
         patch("app.services.review.OpenAIService", return_value=mock_openai_service_instance):
        
        from app.database import get_db
        app.dependency_overrides[get_db] = lambda: db
        
        yield TestClient(app)
        
        app.dependency_overrides = {}

def test_crawl_network_error(client, mock_orchestrator_instance):
    """
    Test handling of network errors during crawl.
    The orchestrator should handle exceptions from individual crawlers gracefully.
    """
    # Simulate search_all returning partial results or empty due to error
    # Note: MultiSourceOrchestrator.search_all catches exceptions internally and logs them, 
    # returning empty list for failed sources.
    
    # We can't easily mock the internal exception catching of the real Orchestrator unless we use the real one with mocked crawlers.
    # But here we are mocking the Orchestrator instance itself.
    
    # If we want to test the API response when orchestrator returns empty due to error:
    mock_orchestrator_instance.search_all.return_value = {}
    
    # Trigger crawl (using the search endpoint which triggers crawl)
    response = client.post("/api/crawl/jobs", json={
        "keywords": ["network error test"],
        "year_from": 2023,
        "year_to": 2024
    })
    
    # The API should still return 200 OK with a job ID, as it's async or handled gracefully
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    
    # If we want to test the Orchestrator logic itself (unit test style):
    real_orchestrator = MultiSourceOrchestrator()
    with patch.object(real_orchestrator, "_create_crawler") as mock_create:
        mock_crawler = MagicMock()
        mock_crawler.search_raw.side_effect = Exception("Network Error")
        mock_create.return_value = mock_crawler
        
        results = real_orchestrator.search_all("query", ["arxiv"])
        assert results["arxiv"] == [] # Should return empty list on error, not raise

def test_llm_timeout(client, db, mock_openai_service_instance):
    """
    Test handling of LLM timeouts during review generation.
    """
    # Simulate timeout exception
    mock_openai_service_instance.generate_lit_review.side_effect = Exception("Request timed out")
    
    # Create dummy papers in DB to allow review generation to proceed to LLM step
    paper = Paper(title="Test Paper", abstract="Abstract", year=2023, source="arxiv", url="http://example.com")
    db.add(paper)
    db.commit()
    
    response = client.post("/api/reviews/generate", json={
        "keywords": ["timeout test"],
        "paper_ids": [paper.id]
    })
    
    # The API catches the exception and returns a failed status
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["status"] == "failed"
    assert "Request timed out" in data["message"]

def test_third_party_rate_limit(client, mock_orchestrator_instance):
    """
    Test handling of rate limits (simulated).
    """
    # Similar to network error, but specific to rate limit logic if implemented.
    # Currently MultiSourceOrchestrator catches all exceptions.
    
    real_orchestrator = MultiSourceOrchestrator()
    with patch.object(real_orchestrator, "_create_crawler") as mock_create:
        mock_crawler = MagicMock()
        # Simulate a specific error if we had a RateLimitError class, otherwise generic Exception
        mock_crawler.search_raw.side_effect = Exception("429 Too Many Requests")
        mock_create.return_value = mock_crawler
        
        results = real_orchestrator.search_all("query", ["scopus"])
        assert results["scopus"] == []

def test_crawl_retry_strategy():
    """
    Test retry strategy (if implemented).
    Since we don't have explicit retry logic in the base crawler yet (it's a TODO item),
    we verify that the infrastructure allows for it or that we can at least catch the error.
    
    For now, we verify that a transient error doesn't crash the whole orchestrator.
    """
    real_orchestrator = MultiSourceOrchestrator()
    with patch.object(real_orchestrator, "_create_crawler") as mock_create:
        mock_crawler = MagicMock()
        # First call fails, second succeeds (simulating retry if we were testing a retry decorator)
        # But here we just test that one failure doesn't stop others
        
        mock_crawler_1 = MagicMock()
        mock_crawler_1.search_raw.side_effect = Exception("Fail")
        
        mock_crawler_2 = MagicMock()
        mock_crawler_2.search_raw.return_value = []
        
        # We need to mock _create_crawler to return different crawlers for different sources
        def side_effect(name):
            if name == "source1": return mock_crawler_1
            if name == "source2": return mock_crawler_2
            return None
            
        mock_create.side_effect = side_effect
        
        results = real_orchestrator.search_all("query", ["source1", "source2"])
        
        assert results["source1"] == [] # Failed
        assert results["source2"] == [] # Succeeded (empty list)
        # The key is that source2 was attempted despite source1 failing