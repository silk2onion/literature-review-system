"""
文献引用关系相关的 Pydantic schemas
"""
from datetime import datetime
from typing import Optional, Dict, Any

from pydantic import BaseModel, Field


class PaperCitationBase(BaseModel):
    """文献引用关系基础字段"""
    citing_paper_id: int = Field(..., description="引用者文献 ID")
    cited_paper_id: int = Field(..., description="被引文献 ID")
    source: Optional[str] = Field(default=None, description="引用数据来源，如 scopus/crossref/llm_parsed")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="0-1 置信度，供图算法加权使用")
    source_meta: Optional[Dict[str, Any]] = Field(default=None, description="来源相关的原始元信息")


class PaperCitationCreate(PaperCitationBase):
    """创建文献引用关系请求"""
    pass


class PaperCitationResponse(PaperCitationBase):
    """文献引用关系响应"""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True