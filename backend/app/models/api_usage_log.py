"""
API 使用日志模型
记录 LLM / Embedding / 爬虫 等外部 API 调用的详细信息
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON
from app.database import Base


class ApiUsageLog(Base):
    """
    API 使用日志表

    字段说明：
    - call_type:  调用类型 — "llm" | "embedding" | "crawler"
    - source:     具体来源 — 如 "openai", "scopus", "crossref", "semantic_scholar" 等
    - model:      模型名称（LLM/Embedding 适用）— 如 "gpt-5.4", "text-embedding-3-small"
    - endpoint:   请求的端点/URL
    - method:     HTTP 方法 — "POST", "GET" 等
    - status_code: HTTP 状态码（0 表示连接失败）
    - success:    是否成功（1=成功, 0=失败）
    - duration_ms: 耗时（毫秒）
    - tokens_in:  输入 token 数（LLM/Embedding 适用）
    - tokens_out: 输出 token 数（LLM 适用）
    - result_count: 返回结果数量（爬虫适用 — 返回了多少篇论文）
    - error:      错误信息（失败时记录）
    - metadata_json: 附加元数据（JSON）— 如查询参数、请求详情等
    - caller:     调用者标识 — 如 "generate_review_framework", "backfill_embeddings", "crawl_openalex"
    - created_at: 创建时间
    """
    __tablename__ = "api_usage_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_type = Column(String(20), nullable=False, index=True)        # "llm" | "embedding" | "crawler"
    source = Column(String(50), nullable=False, index=True)           # "openai", "scopus", etc.
    model = Column(String(100), nullable=True)                        # model name
    endpoint = Column(String(500), nullable=True)                     # request URL / endpoint
    method = Column(String(10), nullable=True, default="POST")        # HTTP method
    status_code = Column(Integer, nullable=True, default=0)           # HTTP status code
    success = Column(Integer, nullable=False, default=1)              # 1=ok, 0=fail
    duration_ms = Column(Float, nullable=True, default=0)             # elapsed time in ms
    tokens_in = Column(Integer, nullable=True, default=0)             # input tokens
    tokens_out = Column(Integer, nullable=True, default=0)            # output tokens
    result_count = Column(Integer, nullable=True, default=0)          # crawler: papers returned
    error = Column(Text, nullable=True)                               # error message
    metadata_json = Column(JSON, nullable=True)                       # extra metadata
    caller = Column(String(100), nullable=True)                       # who called this
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "call_type": self.call_type,
            "source": self.source,
            "model": self.model,
            "endpoint": self.endpoint,
            "method": self.method,
            "status_code": self.status_code,
            "success": bool(self.success),
            "duration_ms": self.duration_ms,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "result_count": self.result_count,
            "error": self.error,
            "metadata_json": self.metadata_json,
            "caller": self.caller,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }