"""
数据库初始化和会话管理
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
from app.config import settings

# 创建数据库引擎
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=settings.DEBUG  # 开发模式下打印SQL
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建基类
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    获取数据库会话
    用于FastAPI的依赖注入
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    初始化数据库
    创建所有表
    """
    # 导入所有模型以确保它们被注册
    from app import models  # noqa: F401
    
    # 创建所有表
    Base.metadata.create_all(bind=engine)
    print("✅ 数据库表创建成功！")


def drop_db():
    """
    删除所有表（谨慎使用！）
    """
    Base.metadata.drop_all(bind=engine)
    print("⚠️ 所有数据库表已删除！")