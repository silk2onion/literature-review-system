"""
数据库模型模块
"""
from app.models.paper import Paper
from app.models.review import Review, ReviewPaper
from app.models.crawl_job import CrawlJob
from app.models.staging_paper import StagingPaper
from app.models.tag import Tag, TagGroup, PaperTag, TagGroupTag
from app.models.paper_chunk import PaperChunk
from app.models.system_setting import SystemSetting
from .citation import PaperCitation
from .recall_log import RecallLog
from .group import PaperGroup, PaperGroupAssociation

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
    "PaperGroup",
    "PaperGroupAssociation",
]