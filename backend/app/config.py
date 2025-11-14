"""
应用配置管理
使用pydantic-settings进行环境变量管理
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os


class Settings(BaseSettings):
    """应用设置"""
    
    # 应用基本配置
    APP_NAME: str = "Literature Review System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # 数据库配置
    DATABASE_URL: str = "sqlite:///./literature.db"
    
    # Redis配置
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""
    
    @property
    def REDIS_URL(self) -> str:
        """构建Redis URL"""
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
    
    # LLM / OpenAI 兼容API配置
    # 基础通用配置（从 .env 读取）
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4"

    # 可选：预设多个模型名称，方便在代码中做校验或切换
    SUPPORTED_LLM_MODELS: List[str] = [
        "gpt-4",
        "gpt-4.1-mini",
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-3.5-turbo",
        "qwen-turbo",
        "llama-3-70b",
    ]
    
    # 爬虫配置
    CRAWLER_DELAY_MIN: int = 1
    CRAWLER_DELAY_MAX: int = 3
    CRAWLER_MAX_RETRIES: int = 3
    CRAWLER_TIMEOUT: int = 30
    
    # 文件存储路径
    PAPERS_DIR: str = "../data/papers"
    EXPORTS_DIR: str = "../data/exports"
    
    @property
    def PAPERS_PATH(self) -> str:
        """获取文献存储绝对路径"""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_dir, self.PAPERS_DIR)
    
    @property
    def EXPORTS_PATH(self) -> str:
        """获取导出文件绝对路径"""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_dir, self.EXPORTS_DIR)
    
    # CORS配置
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]
    
    # JWT配置（可选）
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Pydantic v2配置
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )
    
    def create_directories(self):
        """创建必要的目录"""
        os.makedirs(self.PAPERS_PATH, exist_ok=True)
        os.makedirs(self.EXPORTS_PATH, exist_ok=True)


# 创建全局设置实例
settings = Settings()

# 注意：不在模块导入时创建目录，避免阻塞导入
# 目录将在应用启动时通过lifespan创建


def get_settings() -> Settings:
    """获取全局Settings单例"""
    return settings