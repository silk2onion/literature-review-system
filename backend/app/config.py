"""
应用配置管理
使用pydantic-settings进行环境变量管理
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_SQLITE_DB_PATH = BACKEND_DIR / "literature.db"


class Settings(BaseSettings):
    """应用设置"""
    
    # 应用基本配置
    APP_NAME: str = "Literature Review System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 5455
    
    # 数据库配置
    # 使用项目根目录下的绝对路径，避免因启动工作目录不同而生成多份 SQLite
    DATABASE_URL: str = f"sqlite:///{DEFAULT_SQLITE_DB_PATH.as_posix()}"
    
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
    OPENAI_MODEL: str = "「team」gpt-5.4"

    # Embedding 模型配置
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 0  # 0 = 使用模型默认维度，>0 则强制截断/指定

    # 可选：预设多个模型名称，方便在代码中做校验或切换
    SUPPORTED_LLM_MODELS: List[str] = [
        "gpt-4",
        "gpt-4.1-mini",
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-3.5-turbo",
        "qwen-turbo",
        "llama-3-70b",
        "gpt-5.4",
        "「team」gpt-5.4",
    ]

    SUPPORTED_EMBEDDING_MODELS: List[str] = [
        "text-embedding-3-small",
        "text-embedding-3-large",
    ]
    
    # 爬虫配置
    CRAWLER_DELAY_MIN: int = 1
    CRAWLER_DELAY_MAX: int = 3
    CRAWLER_MAX_RETRIES: int = 3
    CRAWLER_TIMEOUT: int = 30

    # 外部文献数据源配置（预留）
    # SerpAPI - Google Scholar 代理
    SERPAPI_API_KEY: str = ""
    SERPAPI_SCHOLAR_ENABLED: bool = False
    SERPAPI_SCHOLAR_ENGINE: str = "google_scholar"

    # OpenAlex API（免费，无需 API Key；加 email 进入 polite pool 提速）
    OPENALEX_ENABLED: bool = True
    OPENALEX_EMAIL: str = ""  # 填入邮箱可进入 polite pool（无速率限制）

    # Scopus API（低等级）预留
    SCOPUS_ENABLED: bool = False
    SCOPUS_API_KEY: str = ""
    SCOPUS_API_BASE_URL: str = "https://api.elsevier.com/content/search/scopus"

    # Semantic Scholar API（免费，无需 API Key；有 Key 可提速至 10 req/sec）
    SEMANTIC_SCHOLAR_ENABLED: bool = True
    SEMANTIC_SCHOLAR_API_KEY: str = ""

    # 机构访问配置（EZProxy / Shibboleth 认证 + PDF 下载）
    INSTITUTIONAL_ENABLED: bool = False
    INSTITUTIONAL_NAME: str = ""
    INSTITUTIONAL_AUTH_TYPE: str = "ezproxy"  # ezproxy | shibboleth
    INSTITUTIONAL_LOGIN_URL: str = ""
    INSTITUTIONAL_EZPROXY_PREFIX: str = ""
    INSTITUTIONAL_USERNAME: str = ""
    INSTITUTIONAL_PASSWORD: str = ""
    SELENIUM_HEADLESS: bool = True

    # Web of Science 爬虫（需要机构访问）
    WOS_ENABLED: bool = False
    
    # AI 助手主动模式配置
    AGENT_PROACTIVE_ENABLED: bool = True
    AGENT_HEARTBEAT_INTERVAL: int = 60  # 秒
    HEARTBEAT_MODEL: str = ""  # 心跳专用模型，为空则使用 OPENAI_MODEL
    SCREENING_MODEL: str = ""  # AI 筛选专用模型（轻量即可），为空则使用 OPENAI_MODEL

    
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
    
    # CORS配置（使用通配符允许任意来源，方便公网/局域网访问）
    CORS_ORIGINS: List[str] = ["*"]
    
    # JWT配置（可选）
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Pydantic v2配置
    model_config = SettingsConfigDict(
        env_file=str(DEFAULT_ENV_FILE),
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