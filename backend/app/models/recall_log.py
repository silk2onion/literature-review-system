"""
召回与交互日志模型
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Index
from sqlalchemy.orm import relationship

from app.database import Base


class RecallLog(Base):
    """
    召回与交互日志

    用途：
    - 记录语义检索 / 综述生成过程中的查询、结果列表、点击与采纳行为
    - 为后续“标签网 + 自学习召回增强”提供训练与评估数据

    约定：
    - event_type:
        - query: 一次检索请求
        - click: 用户点击某篇候选文献
        - accept: 用户在综述或分组中采纳某篇文献
        - other: 预留
    - source:
        - semantic_search: 语义检索接口
        - review_generate: 综述生成流程
        - other: 预留
    """

    __tablename__ = "recall_logs"

    id = Column(Integer, primary_key=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # 事件类型与来源
    event_type = Column(String(50), nullable=False, index=True)
    source = Column(String(50), nullable=True, index=True)

    # 查询相关信息（对于 click/accept 事件可选）
    query_keywords = Column(JSON, nullable=True)
    group_keys = Column(JSON, nullable=True)

    # 文献相关信息：对于 query 事件通常为空
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="SET NULL"), nullable=True, index=True)
    rank = Column(Integer, nullable=True)
    score = Column(Float, nullable=True)

    # 额外上下文，例如 top-k 结果列表、前端会话 ID 等
    extra = Column(JSON, nullable=True)

    # 可选：关系到 Paper（目前暂不需要反向关系）
    paper = relationship("Paper", backref="recall_logs", lazy="joined")

    __table_args__ = (
        Index("ix_recall_logs_event_source_time", "event_type", "source", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"RecallLog(id={self.id}, event_type={self.event_type}, "
            f"source={self.source}, paper_id={self.paper_id}, score={self.score})"
        )