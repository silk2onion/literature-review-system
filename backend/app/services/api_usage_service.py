"""
API 使用日志服务
提供异步记录 + 查询 + 统计能力

设计原则：
- 日志写入使用独立的 DB Session，不干扰调用方的事务
- 所有写入操作都用 try/except 包裹，日志记录失败不应影响业务逻辑
- 提供同步 log_xxx() 便捷方法供各埋点使用
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, desc, case
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.api_usage_log import ApiUsageLog

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
#  写入 API
# ═══════════════════════════════════════════════════════════════

def log_api_usage(
    call_type: str,
    source: str,
    *,
    model: Optional[str] = None,
    endpoint: Optional[str] = None,
    method: str = "POST",
    status_code: int = 200,
    success: bool = True,
    duration_ms: float = 0,
    tokens_in: int = 0,
    tokens_out: int = 0,
    result_count: int = 0,
    error: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
    caller: Optional[str] = None,
) -> None:
    """
    同步写入一条 API 使用日志。

    使用独立 Session，不影响调用方事务。
    失败时仅打印 warning 不抛异常。
    """
    try:
        db = SessionLocal()
        try:
            log_entry = ApiUsageLog(
                call_type=call_type,
                source=source,
                model=model,
                endpoint=endpoint,
                method=method,
                status_code=status_code,
                success=1 if success else 0,
                duration_ms=round(duration_ms, 2),
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                result_count=result_count,
                error=error[:2000] if error else None,  # 截断过长错误
                metadata_json=metadata_json,
                caller=caller,
                created_at=datetime.utcnow(),
            )
            db.add(log_entry)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("Failed to write API usage log: %s", e)
        finally:
            db.close()
    except Exception as e:
        logger.warning("Failed to create DB session for API usage log: %s", e)


# ── 便捷包装 ──────────────────────────────────────────────────

def log_llm_usage(
    *,
    model: str,
    caller: str,
    duration_ms: float,
    tokens_in: int = 0,
    tokens_out: int = 0,
    success: bool = True,
    status_code: int = 200,
    error: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
) -> None:
    """记录 LLM 调用"""
    log_api_usage(
        call_type="llm",
        source="openai",
        model=model,
        endpoint="chat/completions",
        method="POST",
        status_code=status_code,
        success=success,
        duration_ms=duration_ms,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        error=error,
        metadata_json=metadata_json,
        caller=caller,
    )


def log_embedding_usage(
    *,
    model: str,
    caller: str,
    duration_ms: float,
    tokens_in: int = 0,
    input_count: int = 0,
    success: bool = True,
    error: Optional[str] = None,
) -> None:
    """记录 Embedding 调用"""
    log_api_usage(
        call_type="embedding",
        source="openai",
        model=model,
        endpoint="embeddings",
        method="POST",
        status_code=200 if success else 500,
        success=success,
        duration_ms=duration_ms,
        tokens_in=tokens_in,
        result_count=input_count,
        error=error,
        caller=caller,
    )


def log_crawler_usage(
    *,
    source: str,
    endpoint: str,
    method: str = "GET",
    status_code: int = 200,
    duration_ms: float = 0,
    result_count: int = 0,
    success: bool = True,
    error: Optional[str] = None,
    caller: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
) -> None:
    """记录爬虫 API 调用"""
    log_api_usage(
        call_type="crawler",
        source=source,
        endpoint=endpoint[:500] if endpoint else None,
        method=method,
        status_code=status_code,
        success=success,
        duration_ms=duration_ms,
        result_count=result_count,
        error=error,
        caller=caller,
        metadata_json=metadata_json,
    )


# ═══════════════════════════════════════════════════════════════
#  查询 API
# ═══════════════════════════════════════════════════════════════

def query_usage_logs(
    db: Session,
    *,
    call_type: Optional[str] = None,
    source: Optional[str] = None,
    model: Optional[str] = None,
    success: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> Tuple[List[ApiUsageLog], int]:
    """
    分页查询 API 使用日志。

    Returns:
        (items, total_count)
    """
    q = db.query(ApiUsageLog)

    if call_type:
        q = q.filter(ApiUsageLog.call_type == call_type)
    if source:
        q = q.filter(ApiUsageLog.source == source)
    if model:
        q = q.filter(ApiUsageLog.model.like(f"%{model}%"))
    if success is not None:
        q = q.filter(ApiUsageLog.success == (1 if success else 0))
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            q = q.filter(ApiUsageLog.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            # 如果只给了日期（无时间部分），则取当天结束
            if len(date_to) <= 10:
                dt_to = dt_to + timedelta(days=1)
            q = q.filter(ApiUsageLog.created_at < dt_to)
        except ValueError:
            pass

    total = q.count()
    items = (
        q.order_by(desc(ApiUsageLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total


def get_usage_stats(
    db: Session,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    """
    获取 API 使用统计摘要。
    """
    q = db.query(ApiUsageLog)

    if date_from:
        try:
            q = q.filter(ApiUsageLog.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            if len(date_to) <= 10:
                dt_to = dt_to + timedelta(days=1)
            q = q.filter(ApiUsageLog.created_at < dt_to)
        except ValueError:
            pass

    total_calls = q.count()
    if total_calls == 0:
        return {
            "total_calls": 0,
            "total_errors": 0,
            "total_tokens_in": 0,
            "total_tokens_out": 0,
            "total_duration_ms": 0,
            "by_type": {},
            "by_source": {},
            "by_model": {},
            "error_rate": 0,
            "avg_duration_ms": 0,
        }

    # 聚合查询
    agg = q.with_entities(
        func.count().label("total"),
        func.sum(case((ApiUsageLog.success == 0, 1), else_=0)).label("errors"),
        func.coalesce(func.sum(ApiUsageLog.tokens_in), 0).label("tokens_in"),
        func.coalesce(func.sum(ApiUsageLog.tokens_out), 0).label("tokens_out"),
        func.coalesce(func.sum(ApiUsageLog.duration_ms), 0).label("duration"),
    ).first()

    total = agg.total or 0
    total_errors = agg.errors or 0
    total_tokens_in = int(agg.tokens_in or 0)
    total_tokens_out = int(agg.tokens_out or 0)
    total_duration = float(agg.duration or 0)

    # by_type
    by_type_rows = (
        q.with_entities(ApiUsageLog.call_type, func.count())
        .group_by(ApiUsageLog.call_type)
        .all()
    )
    by_type = {row[0]: row[1] for row in by_type_rows if row[0]}

    # by_source
    by_source_rows = (
        q.with_entities(ApiUsageLog.source, func.count())
        .group_by(ApiUsageLog.source)
        .all()
    )
    by_source = {row[0]: row[1] for row in by_source_rows if row[0]}

    # by_model (only non-null)
    by_model_rows = (
        q.filter(ApiUsageLog.model.isnot(None))
        .with_entities(ApiUsageLog.model, func.count())
        .group_by(ApiUsageLog.model)
        .all()
    )
    by_model = {row[0]: row[1] for row in by_model_rows if row[0]}

    return {
        "total_calls": total,
        "total_errors": total_errors,
        "total_tokens_in": total_tokens_in,
        "total_tokens_out": total_tokens_out,
        "total_duration_ms": round(total_duration, 2),
        "by_type": by_type,
        "by_source": by_source,
        "by_model": by_model,
        "error_rate": round(total_errors / total, 4) if total > 0 else 0,
        "avg_duration_ms": round(total_duration / total, 2) if total > 0 else 0,
    }


def delete_old_logs(db: Session, days: int = 30) -> int:
    """删除指定天数之前的旧日志"""
    cutoff = datetime.utcnow() - timedelta(days=days)
    count = db.query(ApiUsageLog).filter(ApiUsageLog.created_at < cutoff).delete()
    db.commit()
    return count


# ═══════════════════════════════════════════════════════════════
#  计时上下文管理器（给埋点用）
# ═══════════════════════════════════════════════════════════════

class ApiTimer:
    """
    简单的计时器，用于测量 API 调用耗时。

    Usage:
        timer = ApiTimer()
        # ... do API call ...
        elapsed = timer.elapsed_ms()
    """
    def __init__(self):
        self._start = time.perf_counter()

    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self._start) * 1000