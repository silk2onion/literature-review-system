"""
期刊信息相关 API 路由（占位实现）
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.journal_info_service import get_journal_info_service


router = APIRouter(
    prefix="/api/journal-info",
    tags=["journal-info"],
)


class JournalInfoLookupResponse(BaseModel):
    """期刊信息查询结果（当前为占位结构）"""

    name: Optional[str] = None
    issn: Optional[str] = None
    impact_factor: Optional[float] = None
    quartile: Optional[str] = None
    indexing: Optional[List[str]] = None
    source: str = "placeholder"


class PaperJournalEnrichResponse(BaseModel):
    """针对单篇论文的期刊信息增强结果（占位）"""

    paper_id: int
    updated: bool
    message: str


@router.get("/lookup", response_model=JournalInfoLookupResponse)
def lookup_journal_info(
    issn: Optional[str] = None,
    name: Optional[str] = None,
) -> JournalInfoLookupResponse:
    """
    按 ISSN 或期刊名查询期刊信息的占位接口。

    当前实现：
    - 如果未提供 issn 与 name，则返回 400；
    - 内部调用 JournalInfoService 的占位方法以便后续扩展；
    - 返回一个仅带有输入信息的占位结果。
    """
    if not issn and not name:
        raise HTTPException(status_code=400, detail="必须提供 issn 或 name 之一")

    service = get_journal_info_service()
    # 当前实现仅作为占位：调用服务以记录日志，但忽略其返回值
    if issn:
        _ = service.lookup_by_issn(issn)
    elif name:
        _ = service.lookup_by_name(name)

    return JournalInfoLookupResponse(
        name=name or None,
        issn=issn or None,
        impact_factor=None,
        quartile=None,
        indexing=None,
        source="placeholder",
    )


@router.post("/enrich-paper/{paper_id}", response_model=PaperJournalEnrichResponse)
def enrich_paper_journal_info(
    paper_id: int,
    db: Session = Depends(get_db),
) -> PaperJournalEnrichResponse:
    """
    为单篇论文预留的“期刊信息增强”占位接口。

    当前实现：
    - 仅获取 JournalInfoService 实例以便后续扩展；
    - 不修改数据库中的任何内容；
    - 返回占位结果，提示功能尚未真正实现。
    """
    _ = get_journal_info_service()
    _ = db  # 占位使用，避免未使用参数告警

    return PaperJournalEnrichResponse(
        paper_id=paper_id,
        updated=False,
        message="期刊信息增强功能尚未实现（占位接口）",
    )