"""
API路由模块
"""
from .papers import router as papers_router
from .reviews import router as reviews_router

__all__ = ["papers_router", "reviews_router"]