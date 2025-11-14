"""
数据库模型模块
"""
from .paper import Paper
from .review import Review, ReviewPaper

__all__ = ["Paper", "Review", "ReviewPaper"]