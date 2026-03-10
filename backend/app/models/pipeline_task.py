"""
Pipeline Task 数据模型
用于持久化 PhD Pipeline 任务状态，保证重启后服务仍可查询历史任务。
"""
from sqlalchemy import Column, Integer, String, JSON, DateTime, Text
from datetime import datetime

from app.database import Base


class PipelineTask(Base):
    """Pipeline 任务状态模型"""
    __tablename__ = "pipeline_tasks"
    
    # 使用 UUID 字符串作为主键，和 TaskState 的 task_id 保持一致
    task_id = Column(String(50), primary_key=True, index=True)
    
    # 任务基本信息
    topic = Column(String(500), nullable=False)
    keywords = Column(JSON)  # list[str]
    
    # 状态：pending, running, done, failed
    status = Column(String(50), default="pending", index=True)
    
    # 任务配置信息等直接序列化到这
    state_data = Column(JSON)  # 保存 TaskState.to_dict() 输出的完整快照，包含 steps, logs
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True)
    
    error = Column(Text, nullable=True)
    review_id = Column(Integer, nullable=True)
    
    def __repr__(self):
        return f"<PipelineTask(task_id='{self.task_id}', status='{self.status}')>"
