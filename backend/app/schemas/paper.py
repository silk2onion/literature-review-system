"""
Paper相关的Pydantic schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime


class PaperBase(BaseModel):
    """文献基础模型"""
    title: str = Field(..., description="文献标题")
    authors: Optional[List[str]] = Field(default=None, description="作者列表")
    abstract: Optional[str] = Field(default=None, description="摘要")
    publication_date: Optional[date] = Field(default=None, description="发表日期")
    year: Optional[int] = Field(default=None, description="发表年份")
    journal: Optional[str] = Field(default=None, description="期刊名称")
    venue: Optional[str] = Field(default=None, description="发表场所")
    doi: Optional[str] = Field(default=None, description="DOI")
    arxiv_id: Optional[str] = Field(default=None, description="Arxiv ID")
    pmid: Optional[str] = Field(default=None, description="PubMed ID")
    url: Optional[str] = Field(default=None, description="论文链接")
    pdf_url: Optional[str] = Field(default=None, description="PDF链接")
    source: Optional[str] = Field(default=None, description="数据源")
    categories: Optional[List[str]] = Field(default=None, description="分类")
    keywords: Optional[List[str]] = Field(default=None, description="关键词")
    citations_count: Optional[int] = Field(default=0, description="引用数")


class PaperCreate(PaperBase):
    """创建文献的请求模型"""
    pass


class PaperUpdate(BaseModel):
    """更新文献的请求模型"""
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    abstract: Optional[str] = None
    publication_date: Optional[date] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    venue: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    pmid: Optional[str] = None
    url: Optional[str] = None
    pdf_url: Optional[str] = None
    pdf_path: Optional[str] = None
    source: Optional[str] = None
    categories: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    citations_count: Optional[int] = None


class PaperResponse(PaperBase):
    """文献响应模型"""
    id: int
    pdf_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True  # Pydantic v2


class PaperSearch(BaseModel):
    """文献搜索请求模型"""
    keywords: List[str] = Field(..., description="搜索关键词", min_length=1)
    sources: List[str] = Field(
        default=["arxiv", "google_scholar"],
        description="数据源列表"
    )
    limit: int = Field(default=20, ge=1, le=100, description="返回数量限制")
    year_from: Optional[int] = Field(default=None, description="起始年份")
    year_to: Optional[int] = Field(default=None, description="结束年份")
    
    class Config:
        json_schema_extra = {
            "example": {
                "keywords": ["urban design", "sustainable cities"],
                "sources": ["arxiv", "google_scholar"],
                "limit": 20,
                "year_from": 2020
            }
        }


class PaperSearchResponse(BaseModel):
    """文献搜索响应（外部爬虫）"""
    success: bool
    total: int
    papers: List[PaperResponse]
    message: Optional[str] = None


class PaperSearchLocal(BaseModel):
    """本地文献库检索请求模型"""
    q: Optional[str] = Field(
        default=None,
        description="关键词，模糊匹配 title / abstract"
    )
    year_from: Optional[int] = Field(
        default=None,
        description="起始年份（包含）"
    )
    year_to: Optional[int] = Field(
        default=None,
        description="结束年份（包含）"
    )
    page: int = Field(
        default=1,
        ge=1,
        description="页码，从 1 开始"
    )
    page_size: int = Field(
        default=20,
        ge=1,
        le=100,
        description="每页数量，建议不超过 100"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "q": "urban design",
                "year_from": 2015,
                "year_to": 2024,
                "page": 1,
                "page_size": 20,
            }
        }


class PaperSearchLocalResponse(BaseModel):
    """本地文献库检索响应模型"""
    success: bool
    total: int
    items: List[PaperResponse]
    message: Optional[str] = None