"""
API 使用日志 — Pydantic 响应/请求模型
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


# ── 单条日志响应 ──────────────────────────────────────────────
class ApiUsageLogResponse(BaseModel):
    id: int
    call_type: str
    source: str
    model: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    success: bool
    duration_ms: Optional[float] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    result_count: Optional[int] = None
    error: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None
    caller: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── 分页查询参数 ──────────────────────────────────────────────
class ApiUsageQueryParams(BaseModel):
    """前端传入的查询筛选条件"""
    call_type: Optional[str] = None        # "llm" | "embedding" | "crawler"
    source: Optional[str] = None           # "openai", "scopus", etc.
    model: Optional[str] = None
    success: Optional[bool] = None
    date_from: Optional[str] = None        # ISO date string "2026-03-24"
    date_to: Optional[str] = None
    page: int = 1
    page_size: int = 50


# ── 分页响应 ──────────────────────────────────────────────────
class ApiUsagePageResponse(BaseModel):
    items: List[ApiUsageLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── 统计摘要 ──────────────────────────────────────────────────
class ApiUsageStatsResponse(BaseModel):
    """汇总统计"""
    total_calls: int = 0
    total_errors: int = 0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_duration_ms: float = 0
    by_type: Dict[str, int] = {}           # {"llm": 120, "embedding": 45, "crawler": 88}
    by_source: Dict[str, int] = {}         # {"openai": 165, "scopus": 30, ...}
    by_model: Dict[str, int] = {}          # {"gpt-5.4": 100, "text-embedding-3-small": 45}
    error_rate: float = 0                  # 0.0 ~ 1.0
    avg_duration_ms: float = 0