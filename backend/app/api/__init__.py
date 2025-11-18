"""
API路由模块
"""
from app.api.papers import router as papers_router
from app.api.reviews import router as reviews_router
from app.api.crawl import router as crawl_router
from app.api.semantic_search import router as semantic_search_router
from app.api.staging_papers import router as staging_papers_router
from app.api.citations import router as citations_router
from app.api.citation_analysis import router as citation_analysis_router
from app.api.journal_info import router as journal_info_router
from app.api.recall_logs import router as recall_logs_router
from app.api.groups import router as groups_router

__all__ = [
    "papers_router",
    "reviews_router",
    "crawl_router",
    "semantic_search_router",
    "staging_papers_router",
    "citations_router",
    "citation_analysis_router",
    "journal_info_router",
    "recall_logs_router",
    "groups_router",
]