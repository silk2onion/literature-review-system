"""
Pydantic schemas for API request/response validation
"""
from .paper import (
    PaperBase,
    PaperCreate,
    PaperUpdate,
    PaperResponse,
    PaperSearch,
    PaperSearchResponse,
    PaperSearchLocal,
    PaperSearchLocalResponse,
)
from .review import (
    ReviewBase,
    ReviewCreate,
    ReviewUpdate,
    ReviewResponse,
    ReviewGenerate,
    ReviewGenerateResponse,
    ReviewFullExport,
)
from .crawl_job import (
    CrawlJobCreate,
    CrawlJobResponse,
    CrawlJobRunOnceResponse,
)

__all__ = [
    # paper
    "PaperBase",
    "PaperCreate",
    "PaperUpdate",
    "PaperResponse",
    "PaperSearch",
    "PaperSearchResponse",
    "PaperSearchLocal",
    "PaperSearchLocalResponse",
    # review
    "ReviewBase",
    "ReviewCreate",
    "ReviewUpdate",
    "ReviewResponse",
    "ReviewGenerate",
    "ReviewGenerateResponse",
    "ReviewFullExport",
    # crawl job
    "CrawlJobCreate",
    "CrawlJobResponse",
    "CrawlJobRunOnceResponse",
]