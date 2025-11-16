"""
语义检索相关的 Pydantic 模型
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .paper import PaperResponse


class SemanticSearchRequest(BaseModel):
    """语义检索请求模型"""

    keywords: List[str] = Field(
        ...,
        min_length=1,
        description="搜索关键词列表（会结合语义组进行扩展）",
    )
    year_from: Optional[int] = Field(
        default=None,
        description="起始年份（包含）",
    )
    year_to: Optional[int] = Field(
        default=None,
        description="结束年份（包含）",
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="返回的最大文献数量",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "keywords": ["urban design", "public space"],
                "year_from": 2015,
                "year_to": 2024,
                "limit": 20,
            }
        }


class SemanticSearchItem(BaseModel):
    """单条语义检索结果"""

    paper: PaperResponse
    score: float


class SemanticSearchDebug(BaseModel):
    """语义检索调试信息"""

    expanded_keywords: List[str]
    activated_groups: Dict[str, Any]
    total_candidates: int


class SemanticSearchResponse(BaseModel):
    """语义检索响应"""

    success: bool
    items: List[SemanticSearchItem]
    debug: SemanticSearchDebug
    message: Optional[str] = None