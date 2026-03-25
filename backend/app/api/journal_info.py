"""
期刊信息相关 API 路由
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.paper import Paper
from app.services.journal_info_service import get_journal_info_service


router = APIRouter(
    prefix="/api/journal-info",
    tags=["journal-info"],
)


class JournalInfoLookupResponse(BaseModel):
    """期刊信息查询结果"""

    name: Optional[str] = None
    issn: Optional[str] = None
    impact_factor: Optional[float] = None
    quartile: Optional[str] = None
    indexing: Optional[List[str]] = None
    source: str = "local_library"


class PaperJournalEnrichResponse(BaseModel):
    """针对单篇论文的期刊信息增强结果"""

    paper_id: int
    updated: bool
    message: str


@router.get("/lookup", response_model=JournalInfoLookupResponse)
def lookup_journal_info(
    issn: Optional[str] = None,
    name: Optional[str] = None,
    db: Session = Depends(get_db),
) -> JournalInfoLookupResponse:
    """
    按 ISSN 或期刊名查询期刊信息。

    当前最小实现：
    - 优先按 ISSN 在本地 Paper 表中查找已有期刊元信息；
    - 若未提供 ISSN，则退化为按期刊名匹配；
    - 未找到时返回 not_found，而非占位结果。
    """
    if not issn and not name:
        raise HTTPException(status_code=400, detail="必须提供 issn 或 name 之一")

    service = get_journal_info_service()
    info = service.lookup_by_issn(db, issn) if issn else service.lookup_by_name(db, name or "")

    if info is None:
        return JournalInfoLookupResponse(
            name=name or None,
            issn=issn or None,
            impact_factor=None,
            quartile=None,
            indexing=None,
            source="not_found",
        )

    return JournalInfoLookupResponse(
        name=info.name or name or None,
        issn=info.issn or issn or None,
        impact_factor=info.impact_factor,
        quartile=info.quartile,
        indexing=info.indexing,
        source="local_library",
    )


@router.post("/enrich-paper/{paper_id}", response_model=PaperJournalEnrichResponse)
def enrich_paper_journal_info(
    paper_id: int,
    db: Session = Depends(get_db),
) -> PaperJournalEnrichResponse:
    """
    为单篇论文执行期刊信息增强。

    当前最小实现：
    - 优先用论文自身 ISSN 匹配本地文献库中的同刊记录；
    - 无 ISSN 时退化为按期刊名匹配；
    - 仅回填当前论文缺失的期刊元信息字段。
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if paper is None:
        raise HTTPException(status_code=404, detail=f"未找到论文: paper_id={paper_id}")

    service = get_journal_info_service()
    result = service.enrich_paper(db, paper)

    return PaperJournalEnrichResponse(
        paper_id=paper_id,
        updated=result.updated,
        message=result.message,
    )