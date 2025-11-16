from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, JSON

from app.database import Base


class CrawlJob(Base):
    """
    长周期抓取任务模型

    - 支持多关键词、多数据源
    - 分页抓取，记录当前进度
    - 以日志 JSON 记录错误、统计信息等
    """

    __tablename__ = "crawl_jobs"

    id = Column(Integer, primary_key=True, index=True)

    # 抓取参数
    keywords = Column(JSON, nullable=False)  # List[str]
    sources = Column(JSON, nullable=False)   # List[str]，如 ["arxiv", "crossref"]
    year_from = Column(Integer, nullable=True)
    year_to = Column(Integer, nullable=True)
    max_results = Column(Integer, nullable=False, default=200)
    page_size = Column(Integer, nullable=False, default=50)

    # 进度状态
    current_page = Column(Integer, nullable=False, default=0)
    fetched_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    status = Column(
        String(32),
        nullable=False,
        default="pending",  # pending / running / completed / failed / paused
    )

    # 日志和元信息
    log = Column(JSON, nullable=True)  # 任意结构的日志列表或汇总信息
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def append_log(self, entry: dict) -> None:  # type: ignore[func-returns-value]
        """
        追加一条日志记录到 log JSON 中

        说明：
        - 这里的 self.log 在类型系统中被视为 Column[Any]，但运行时是普通 JSON 可变对象。
        - 为了避免与 SQLAlchemy 的 Column 类型冲突，只做非常保守的 dict 操作。
        """
        current = self.log or {}
        try:
            entries = list(current.get("entries") or [])
        except AttributeError:
            # 如果 current 不是 dict（极端情况），直接重置为新结构
            entries = []
        entries.append(entry)
        self.log = {"entries": entries}

    def to_dict(self) -> dict:  # type: ignore[override]
        created_at = getattr(self, "created_at", None)
        updated_at = getattr(self, "updated_at", None)
        return {
            "id": self.id,
            "keywords": self.keywords,
            "sources": self.sources,
            "year_from": self.year_from,
            "year_to": self.year_to,
            "max_results": self.max_results,
            "page_size": self.page_size,
            "current_page": self.current_page,
            "fetched_count": self.fetched_count,
            "failed_count": self.failed_count,
            "status": self.status,
            "log": self.log,
            "created_at": created_at.isoformat() if created_at else None,
            "updated_at": updated_at.isoformat() if updated_at else None,
        }