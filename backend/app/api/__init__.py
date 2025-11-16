"""
API路由模块
"""
from .papers import router as papers_router
from .reviews import router as reviews_router
from .crawl import router as crawl_router
from .semantic_search import router as semantic_search_router
from .staging_papers import router as staging_papers_router
from .citations import router as citations_router
from .journal_info import router as journal_info_router
from .recall_logs import router as recall_logs_router

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