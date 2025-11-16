from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


JobStatus = Literal["pending", "running", "completed", "failed", "paused"]


class CrawlJobBase(BaseModel):
    """抓取任务基础参数"""
    keywords: List[str] = Field(..., min_length=1, description="关键词列表")
    sources: List[str] = Field(
        default=["arxiv", "crossref"],
        description="数据源列表"
    )
    year_from: Optional[int] = Field(default=None, description="起始年份")
    year_to: Optional[int] = Field(default=None, description="结束年份")
    max_results: int = Field(default=200, ge=1, le=5000, description="目标抓取总数")
    page_size: int = Field(default=50, ge=1, le=200, description="每轮抓取数量")


class CrawlJobCreate(CrawlJobBase):
    """创建抓取任务请求模型"""
    pass


class CrawlJobResponse(CrawlJobBase):
    """抓取任务详情响应"""
    id: int
    current_page: int
    fetched_count: int
    failed_count: int
    status: JobStatus
    log: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # Pydantic v2


class CrawlJobRunOnceResponse(BaseModel):
    """单次 run_once 执行结果"""
    success: bool
    job: CrawlJobResponse
    new_papers: int = Field(..., description="本次新增入库的文献数")
    total_fetched: int = Field(..., description="该任务累计抓取文献数")
    message: Optional[str] = None


class LatestJobStatusResponse(BaseModel):
    """最新任务状态响应 (用于前端轮询)"""
    job_id: int
    type: Literal['crawl', 'review']  # 匹配前端类型定义
    status: JobStatus
    message: str
    progress_percent: Optional[float] = None


class CrawlJobListResponse(BaseModel):
    """抓取任务列表响应，用于任务列表页"""
    total: int = Field(..., description="符合条件的任务总数")
    items: List[CrawlJobResponse] = Field(..., description="当前页的任务列表")