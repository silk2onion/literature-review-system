"""
系统设置模型
用于持久化存储运行时配置（如 API Key、模型选择等）
"""
from sqlalchemy import Column, String, Text
from app.database import Base

class SystemSetting(Base):
    """系统设置表"""
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text, nullable=True)  # 存储 JSON 字符串或普通文本

    def __repr__(self):
        return f"<SystemSetting(key='{self.key}', value='{self.value[:20]}...')>"
