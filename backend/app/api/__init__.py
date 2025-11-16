"""
API路由模块
"""
from backend.app.api.papers import router as papers_router
from backend.app.api.reviews import router as reviews_router
from backend.app.api.crawl import router as crawl_router
from backend.app.api.semantic_search import router as semantic_search_router
from backend.app.api.staging_papers import router as staging_papers_router
from backend.app.api.citations import router as citations_router
from backend.app.api.journal_info import router as journal_info_router
from backend.app.api.recall_logs import router as recall_logs_router

__all__ = [
    "papers_router",
    "reviews_router",
    "crawl_router",
    "semantic_search_router",
    "staging_papers_router",
    "citations_router",
    "journal_info_router",
    "recall_logs_router",
]