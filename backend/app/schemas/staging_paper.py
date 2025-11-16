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
    llm_tags: Optional[Dict[str, Any]] = Field(default=None, description="LLM 打标信息")
    llm_score: Optional[float] = Field(default=None, description="LLM 评估分数")
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