"""
API路由模块
"""
from .papers import router as papers_router
from .reviews import router as reviews_router
from .crawl import router as crawl_router

__all__ = ["papers_router", "reviews_router", "crawl_router"]