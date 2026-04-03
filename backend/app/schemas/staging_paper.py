"""
StagingPaper 相关的 Pydantic schemas
"""
from datetime import date, datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field


class StagingPaperBase(BaseModel):
    """暂存文献基础模型"""
    title: str = Field(..., description="文献标题")
    authors: Optional[List[str]] = Field(default=None, description="作者列表")
    abstract: Optional[str] = Field(default=None, description="摘要")
    publication_date: Optional[date] = Field(default=None, description="发表日期")
    year: Optional[int] = Field(default=None, description="发表年份")
    journal: Optional[str] = Field(default=None, description="期刊名称")
    venue: Optional[str] = Field(default=None, description="发表场所")
    journal_issn: Optional[str] = Field(default=None, description="期刊 ISSN")
    journal_impact_factor: Optional[float] = Field(default=None, description="期刊影响因子")
    journal_quartile: Optional[str] = Field(default=None, description="期刊分区（如 JCR Q1-Q4 等）")
    indexing: Optional[List[str]] = Field(default=None, description="收录平台列表，例如 SCI、SSCI、Scopus 等")
    doi: Optional[str] = Field(default=None, description="DOI")
    arxiv_id: Optional[str] = Field(default=None, description="Arxiv ID")
    pmid: Optional[str] = Field(default=None, description="PubMed ID")
    url: Optional[str] = Field(default=None, description="论文链接")
    pdf_url: Optional[str] = Field(default=None, description="PDF 链接")
    pdf_path: Optional[str] = Field(default=None, description="本地 PDF 路径")
    source: Optional[str] = Field(default=None, description="数据源")
    source_id: Optional[str] = Field(default=None, description="数据源内部 ID")
    categories: Optional[List[str]] = Field(default=None, description="分类标签")
    keywords: Optional[List[str]] = Field(default=None, description="关键词")
    citations_count: Optional[int] = Field(default=0, description="引用数")
    status: Optional[str] = Field(default=None, description="暂存状态，如 pending/accepted/rejected")
    llm_tags: Optional[Any] = Field(default=None, description="LLM 打标信息（可能是 list 或 dict）")
    llm_score: Optional[float] = Field(default=None, description="LLM 评估分数")
    screening_stage: Optional[str] = Field(default="identification", description="PRISMA 筛选阶段: identification/screening/eligibility/included")
    exclusion_reason: Optional[str] = Field(default=None, description="PRISMA 排除原因")
    final_paper_id: Optional[int] = Field(default=None, description="对应正式库 Paper ID")
    crawl_job_id: Optional[int] = Field(default=None, description="来源抓取任务 ID")


class StagingPaperResponse(StagingPaperBase):
    """暂存文献响应模型"""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StagingPaperSearch(BaseModel):
    """暂存文献库检索请求模型"""
    q: Optional[str] = Field(default=None, description="关键词，模糊匹配 title / abstract")
    status: Optional[str] = Field(default=None, description="状态过滤 pending/accepted/rejected")
    source: Optional[str] = Field(default=None, description="数据源过滤")
    screening_stage: Optional[str] = Field(default=None, description="PRISMA 筛选阶段过滤: identification/screening/eligibility/included")
    crawl_job_id: Optional[int] = Field(default=None, description="来源抓取任务 ID 过滤")
    year_from: Optional[int] = Field(default=None, description="起始年份（包含）")
    year_to: Optional[int] = Field(default=None, description="结束年份（包含）")
    page: int = Field(default=1, ge=1, description="页码，从 1 开始")
    page_size: int = Field(default=20, ge=1, le=200, description="每页数量")

    class Config:
        json_schema_extra = {
            "example": {
                "q": "urban design",
                "status": "pending",
                "source": "scopus",
                "screening_stage": "identification",
                "crawl_job_id": 1,
                "year_from": 2015,
                "year_to": 2024,
                "page": 1,
                "page_size": 20,
            }
        }


class StagingPaperSearchResponse(BaseModel):
    """暂存文献库检索响应模型"""
    success: bool
    total: int
    items: List[StagingPaperResponse]
    message: Optional[str] = None


class StagingPaperPromoteRequest(BaseModel):
    """暂存文献提升请求模型"""
    ids: List[int] = Field(
        ...,
        min_length=1,
        description="待提升为正式库的 StagingPaper ID 列表",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "ids": [1, 2, 3],
            }
        }


# ========== PRISMA 筛选附属功能 Schemas ==========

class ScreeningUpdateRequest(BaseModel):
    """更新单条文献的 PRISMA 筛选阶段"""
    screening_stage: str = Field(
        ...,
        description="目标筛选阶段: identification/screening/eligibility/included",
    )
    exclusion_reason: Optional[str] = Field(
        default=None,
        description="排除原因（当文献被排除时填写）",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "screening_stage": "screening",
                "exclusion_reason": "Not relevant to research question",
            }
        }


class BatchScreeningRequest(BaseModel):
    """批量更新 PRISMA 筛选阶段"""
    ids: List[int] = Field(..., min_length=1, description="待更新的 StagingPaper ID 列表")
    screening_stage: str = Field(
        ...,
        description="目标筛选阶段: identification/screening/eligibility/included",
    )
    exclusion_reason: Optional[str] = Field(
        default=None,
        description="排除原因（批量排除时统一填写）",
    )


class PrismaStageCount(BaseModel):
    """单个 PRISMA 阶段的统计"""
    stage: str
    count: int
    excluded_count: int = Field(default=0, description="该阶段被排除的文献数")


class PrismaStatsResponse(BaseModel):
    """PRISMA 流程统计响应"""
    success: bool
    crawl_job_id: Optional[int] = None
    total: int
    stages: List[PrismaStageCount]
    exclusion_reasons: Dict[str, int] = Field(
        default_factory=dict,
        description="排除原因分类统计 {reason: count}",
    )
    search_strategy: Optional[Dict[str, Any]] = Field(
        default=None,
        description="关联的搜索策略元数据",
    )


# ========== AI 筛选 Schemas ==========

class AIScreenRequest(BaseModel):
    """AI 批量筛选请求"""
    topic: str = Field(..., description="研究主题，用于评估论文相关度")
    ids: Optional[List[int]] = Field(default=None, description="指定 StagingPaper ID 列表")
    crawl_job_ids: Optional[List[int]] = Field(default=None, description="按抓取任务 ID 筛选")
    q: Optional[str] = Field(default=None, description="关键词过滤（模糊匹配 title/abstract），不传则筛选全部 pending")

    class Config:
        json_schema_extra = {
            "example": {
                "topic": "Transit-Oriented Development and pedestrian safety",
                "q": "TOD",
            }
        }


class AIScreenResultItem(BaseModel):
    """单篇论文的 AI 筛选结果"""
    staging_paper_id: int
    score: int
    reason: str
    decision: str = Field(description="promote / pending_review / reject / pre_filtered")


class AIScreenResponse(BaseModel):
    """AI 批量筛选响应"""
    success: bool
    total: int
    scored: int
    promoted: int
    pending_review: int
    rejected: int
    pre_filtered: int = Field(default=0, description="关键词预过滤直接拒绝的数量")
    failed: int
    details: List[AIScreenResultItem] = Field(default_factory=list)


# ========== 信息补齐 Schemas ==========

class EnrichRequest(BaseModel):
    """批量信息补齐请求"""
    ids: Optional[List[int]] = Field(default=None, description="指定要补齐的 StagingPaper ID 列表，不传则补齐所有缺 abstract 的 pending 论文")
    only_missing_abstract: bool = Field(default=True, description="是否只处理缺 abstract 的论文")


class EnrichResultItem(BaseModel):
    """单篇补齐结果"""
    paper_id: int
    enriched_fields: List[str]
    source: str


class EnrichResponse(BaseModel):
    """批量补齐响应"""
    success: bool
    total: int
    enriched: int
    skipped_no_doi: int
    failed: int
    details: List[EnrichResultItem] = Field(default_factory=list)