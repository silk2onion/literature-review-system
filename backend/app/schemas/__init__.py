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
    JobStatus,
    CrawlJobCreate,
    CrawlJobResponse,
    CrawlJobRunOnceResponse,
    LatestJobStatusResponse,
    CrawlJobListResponse,
)
from .semantic_search import (
    SemanticSearchRequest,
    SemanticSearchItem,
    SemanticSearchDebug,
    SemanticSearchResponse,
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
    "JobStatus",
    "CrawlJobCreate",
    "CrawlJobResponse",
    "CrawlJobRunOnceResponse",
    "LatestJobStatusResponse",
    "CrawlJobListResponse",
    # semantic search
    "SemanticSearchRequest",
    "SemanticSearchItem",
    "SemanticSearchDebug",
    "SemanticSearchResponse",
]