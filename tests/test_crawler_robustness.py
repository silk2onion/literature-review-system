import unittest
from unittest.mock import patch, MagicMock
import sys
import os
import asyncio

# Add backend path to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))

from app.services.crawler.arxiv_crawler import ArxivCrawler
from app.services.crawler.base_crawler import CrawlerError
from app.config import Settings


class TestCrawlerRobustness(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = Settings()

    async def test_arxiv_network_timeout(self):
        """Test Arxiv crawler behavior on network timeout"""
        crawler = ArxivCrawler(settings=self.settings)
        
        # Mock the client.results to raise a timeout error
        with patch.object(crawler.client, 'results', side_effect=TimeoutError("Network timeout")):
            with self.assertRaises(Exception):
                crawler.search(keywords=["test"])

    async def test_arxiv_malformed_response(self):
        """Test Arxiv crawler behavior on malformed XML response"""
        crawler = ArxivCrawler(settings=self.settings)
        
        # Mock a malformed result that causes parsing error
        mock_result = MagicMock()
        # Simulate missing required fields
        del mock_result.title
        
        with patch.object(crawler.client, 'results', return_value=[mock_result]):
            # Should handle malformed result gracefully (skip or log error)
            # In current implementation, _parse_result returns None on error
            results = crawler.search(keywords=["test"])
            self.assertEqual(len(results), 0)

if __name__ == '__main__':
    unittest.main()