"""
引用图相关的 Pydantic schema
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class CitationGraphNode(BaseModel):
    """引用图中的节点，通常对应一篇 Paper"""
    id: int = Field(..., description="Paper ID")
    label: str = Field(..., description="显示用标题（可截断）")
    type: Literal["central", "cited", "citing"] = Field(..., description="节点类型")
    year: Optional[int] = Field(default=None, description="出版年份（可选）")
    source: Optional[str] = Field(default=None, description="文献来源，例如 arxiv/scopus 等")
    extra: Optional[Dict[str, Any]] = Field(
        default=None,
        description="额外信息，前端可展示在 tooltip 中",
    )


class CitationGraphEdge(BaseModel):
    """引用图中的边，表示 citing_paper → cited_paper"""
    from_id: int = Field(
        ...,
        alias="from",
        description="起点 Paper ID（引用者）",
    )
    to_id: int = Field(
        ...,
        alias="to",
        description="终点 Paper ID（被引者）",
    )
    source: Optional[str] = Field(
        default=None,
        description="引用数据来源，如 crossref/openalex/llm_parsed_pdf",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="0-1 置信度，用于可视化权重或过滤",
    )
    created_at: Optional[datetime] = Field(
        default=None,
        description="该引用关系首次写入时间（可选）",
    )


class CitationGraphStats(BaseModel):
    """引用图的一些统计信息，方便前端展示摘要信息"""
    total_nodes: int = Field(..., description="总节点数")
    total_edges: int = Field(..., description="总边数")
    by_source: Dict[str, int] = Field(
        default_factory=dict,
        description="按来源统计的边数",
    )
    in_degree: int = Field(..., description="中心节点的入度（被引数）")
    out_degree: int = Field(..., description="中心节点的出度（引用数）")


class CitationGraphResponse(BaseModel):
    """引用自中心图响应，用于前端绘制节点-边图"""
    center_paper_id: int = Field(..., description="中心 Paper ID")
    nodes: List[CitationGraphNode] = Field(..., description="节点列表")
    edges: List[CitationGraphEdge] = Field(..., description="边列表")
    stats: CitationGraphStats = Field(..., description="统计信息")

    class Config:
        # 允许前端使用 from/to 字段名创建模型
        populate_by_name = True