"""
交互召回日志 API
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.recall_log import RecallLog

router = APIRouter(
    prefix="/api/recall-logs",
    tags=["recall_logs"],
)


class RecallInteractionCreate(BaseModel):
    """
    前端交互事件上报模型：
    - event_type: click / accept / other
    - source: 来自哪个界面，例如 semantic_search_panel、review_page 等
    - query_keywords: 当时的查询关键词（如有）
    - group_keys: 当时激活的语义组 key 列表（如有）
    - paper_id: 相关文献 ID（如有）
    - rank: 在当前列表中的排序位置（如有）
    - score: 当前列表中的评分（如有）
    - extra: 其他上下文，如会话 ID、前端过滤条件等
    """

    event_type: str = Field(..., description="事件类型：click / accept / other")
    source: Optional[str] = Field(
        default=None,
        description="事件来源，例如 semantic_search_http / semantic_search_ws / review_page 等",
    )
    query_keywords: Optional[List[str]] = Field(
        default=None,
        description="当时使用的查询关键词列表（如有）",
    )
    group_keys: Optional[List[str]] = Field(
        default=None,
        description="当时激活的语义组 key 列表（如有）",
    )
    paper_id: Optional[int] = Field(
        default=None,
        description="相关文献 ID（如有）",
    )
    rank: Optional[int] = Field(
        default=None,
        description="在当前列表中的排序位置（从 0 或 1 开始，视前端约定而定）",
    )
    score: Optional[float] = Field(
        default=None,
        description="在当前列表中的相似度/打分（如有）",
    )
    extra: Optional[Dict[str, Any]] = Field(
        default=None,
        description="额外上下文信息，如会话 ID、过滤条件等",
    )


class RecallInteractionCreateResponse(BaseModel):
    """
    交互事件创建结果
    """

    success: bool
    id: Optional[int] = None
    message: Optional[str] = None


@router.post("", response_model=RecallInteractionCreateResponse)
def create_recall_interaction(
    payload: RecallInteractionCreate,
    db: Session = Depends(get_db),
) -> RecallInteractionCreateResponse:
    """
    记录一次前端交互事件（点击 / 采纳等），写入 RecallLog 表。
    """
    try:
        log = RecallLog(
            event_type=payload.event_type,
            source=payload.source or "frontend",
            query_keywords=payload.query_keywords,
            group_keys=payload.group_keys,
            paper_id=payload.paper_id,
            rank=payload.rank,
            score=payload.score,
            extra=payload.extra,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return RecallInteractionCreateResponse(
            success=True,
            id=int(getattr(log, "id")),
            message="交互事件已记录",
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"记录交互事件失败: {exc}")