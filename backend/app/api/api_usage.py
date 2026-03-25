"""
API 使用日志路由
提供查询、统计、清理接口
"""
from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.api_usage_log import (
    ApiUsageLogResponse,
    ApiUsagePageResponse,
    ApiUsageStatsResponse,
)
from app.services.api_usage_service import (
    query_usage_logs,
    get_usage_stats,
    delete_old_logs,
)

router = APIRouter(prefix="/api/usage", tags=["API Usage"])


@router.get("/logs", response_model=ApiUsagePageResponse)
def list_usage_logs(
    call_type: Optional[str] = Query(None, description="llm / embedding / crawler"),
    source: Optional[str] = Query(None, description="openai / scopus / crossref ..."),
    model: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    date_from: Optional[str] = Query(None, description="ISO date, e.g. 2026-03-24"),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """分页查询 API 使用日志"""
    items, total = query_usage_logs(
        db,
        call_type=call_type,
        source=source,
        model=model,
        success=success,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return ApiUsagePageResponse(
        items=[ApiUsageLogResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/stats", response_model=ApiUsageStatsResponse)
def usage_stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """获取 API 使用统计摘要"""
    stats = get_usage_stats(db, date_from=date_from, date_to=date_to)
    return ApiUsageStatsResponse(**stats)


@router.delete("/logs/cleanup")
def cleanup_old_logs(
    days: int = Query(30, ge=1, le=365, description="删除多少天前的日志"),
    db: Session = Depends(get_db),
):
    """清理指定天数之前的旧日志"""
    count = delete_old_logs(db, days=days)
    return {"success": True, "deleted": count, "message": f"已删除 {count} 条 {days} 天前的日志"}