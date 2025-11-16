"""
文献引用相关 API 路由
"""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.citation_graph import CitationGraphResponse
from app.services.citation_graph import get_citation_graph_service
from app.services.citation_ingest import get_citation_ingest_service


router = APIRouter(
    prefix="/api/citations",
    tags=["citations"],
)


@router.get("/ego-graph/{paper_id}", response_model=CitationGraphResponse)
def get_citation_ego_graph(
    paper_id: int,
    min_confidence: float = 0.0,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> CitationGraphResponse:
    """
    获取指定论文的一跳自中心引用图。

    - 包含该论文作为中心节点
    - 以及所有引用它的论文（入边）和被它引用的论文（出边）
    """
    service = get_citation_graph_service()
    graph = service.get_ego_graph(
        db=db,
        paper_id=paper_id,
        min_confidence=min_confidence,
        limit=limit,
    )
    if graph is None:
        raise HTTPException(status_code=404, detail="未找到对应论文或引用关系")
    return graph


@router.post("/sync-for-paper/{paper_id}")
def sync_citations_for_paper(
    paper_id: int,
    db: Session = Depends(get_db),
) -> Dict[str, int]:
    """
    触发指定论文的引用关系同步（当前仅使用 Crossref 数据）。

    返回统计信息：
    - total_references: Crossref 返回的引用条目数
    - matched_references: 成功匹配到本地 Paper 的引用数
    - created_edges: 新增的 PaperCitation 记录数
    - citations_count: 同步完成后该论文的被引次数
    """
    service = get_citation_ingest_service()
    stats = service.sync_citations_for_paper(db=db, paper_id=paper_id)
    if not stats:
        raise HTTPException(status_code=404, detail="未找到对应论文")
    return stats