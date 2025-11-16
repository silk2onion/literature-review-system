"""
数据库模型模块
"""
from backend.app.models.paper import Paper
from backend.app.models.review import Review, ReviewPaper
from backend.app.models.crawl_job import CrawlJob
from backend.app.models.staging_paper import StagingPaper
from backend.app.models.tag import Tag, TagGroup, PaperTag, TagGroupTag
from backend.app.models.citation import PaperCitation
from backend.app.models.recall_log import RecallLog

__all__ = [
    "Paper",
    "Review",
    "ReviewPaper",
    "CrawlJob",
    "StagingPaper",
    "Tag",
    "TagGroup",
    "PaperTag",
    "TagGroupTag",
    "PaperCitation",
    "RecallLog",
]