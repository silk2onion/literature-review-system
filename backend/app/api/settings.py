from typing import Any, Dict, List, Optional, Tuple
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import requests

from app.config import settings
from app.database import get_db
from app.models.system_setting import SystemSetting
from app.services.crawler.multi_source_orchestrator import MultiSourceOrchestrator

router = APIRouter(prefix="/api", tags=["settings"])


# ---- 运行时数据源配置 ----


class DataSourceConfig(BaseModel):
    enabled: bool
    api_key: str
    engine: Optional[str] = None


class RagConfig(BaseModel):
    enabled: bool = False


class DataSourcesConfig(BaseModel):
    serpapi: DataSourceConfig
    scopus: DataSourceConfig
    rag: RagConfig


# ---- LLM / Embedding 模型配置 ----


class ModelSelectionConfig(BaseModel):
    llm_model: str
    embedding_model: str
    embedding_dimensions: int = Field(default=0, description="Embedding 维度（0=使用模型默认）")
    screening_model: str = Field(default="", description="AI 筛选专用模型（为空则使用主 LLM 模型）")


class AgentConfig(BaseModel):
    proactive_enabled: bool = True
    heartbeat_interval: int = 60  # seconds


class ModelOptionsResponse(BaseModel):
    llm_models: List[str]
    embedding_models: List[str]
    current_llm_model: str
    current_embedding_model: str
    current_embedding_dimensions: int = 0
    current_screening_model: str = ""


# ---- LLM 连接配置 ----


class LLMConnectionConfig(BaseModel):
    api_key: str = Field(default="", description="OpenAI-compatible API Key")
    base_url: str = Field(default="https://api.openai.com/v1", description="API Base URL")


# ---- 综述生成默认值 ----


class ReviewDefaultsConfig(BaseModel):
    citation_style: str = Field(default="harvard", description="默认引用格式: harvard/apa/ieee/chicago/vancouver")
    language: str = Field(default="zh-CN", description="默认语言: zh-CN / en")
    paper_limit: int = Field(default=30, ge=5, le=500, description="每节最大检索文献数（Scoping Review 可设更高）")
    section_temperature: float = Field(default=0.4, ge=0.0, le=1.0, description="章节生成温度")
    framework_temperature: float = Field(default=0.3, ge=0.0, le=1.0, description="框架生成温度")
    section_max_tokens: int = Field(default=8000, ge=1000, le=32000, description="章节生成最大 token 数")


# ---- 爬虫配置 ----


class CrawlerConfig(BaseModel):
    delay_min: int = Field(default=1, ge=0, le=30, description="请求间最小延迟(秒)")
    delay_max: int = Field(default=3, ge=1, le=60, description="请求间最大延迟(秒)")
    max_retries: int = Field(default=3, ge=0, le=10, description="最大重试次数")
    timeout: int = Field(default=30, ge=5, le=120, description="请求超时(秒)")


# ---- 语义检索配置 ----


class SearchConfig(BaseModel):
    default_top_k: int = Field(default=20, ge=5, le=200, description="默认检索结果数")
    recall_alpha: float = Field(default=0.3, ge=0.0, le=1.0, description="标签/图信号融合权重 alpha")
    embedding_text_max_length: int = Field(default=6000, ge=500, le=20000, description="Embedding 输入文本最大字符数")
    use_graph_propagation: bool = Field(default=True, description="是否启用引用图传播增强")


# ---- 密钥脱敏 ----

MASK_PLACEHOLDER = "****"


def _mask_secret(value: str, show_prefix: int = 3, show_suffix: int = 4) -> str:
    """将密钥脱敏，保留前缀和后缀，中间用 **** 替换。"""
    if not value:
        return ""
    if len(value) < 8 or (show_prefix == 0 and show_suffix == 0):
        return MASK_PLACEHOLDER
    suffix = value[-show_suffix:] if show_suffix > 0 else ""
    return value[:show_prefix] + MASK_PLACEHOLDER + suffix


def _is_masked(value: str) -> bool:
    """判断值是否是脱敏后的 mask 值（包含 ****）。"""
    return MASK_PLACEHOLDER in (value or "")


def _resolve_secret(new_value: str, original_value: str) -> str:
    """如果新值是 mask 值，返回原始值（不覆盖）；否则返回新值。"""
    if not new_value or _is_masked(new_value):
        return original_value
    return new_value


# ---- 数据库辅助函数 ----

def _get_setting(db: Session, key: str, default: Any = None) -> Any:
    """从数据库读取设置，如果不存在则返回默认值"""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting and setting.value:
        try:
            return json.loads(setting.value)
        except json.JSONDecodeError:
            return setting.value
    return default

def _set_setting(db: Session, key: str, value: Any):
    """写入设置到数据库"""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    val_str = json.dumps(value)
    
    if setting:
        setting.value = val_str
    else:
        setting = SystemSetting(key=key, value=val_str)
        db.add(setting)
    db.commit()


# ---- API Endpoints ----

@router.get("/settings/data-sources", response_model=DataSourcesConfig)
def get_data_sources_config(db: Session = Depends(get_db)) -> DataSourcesConfig:
    """
    获取当前运行时数据源配置
    优先从数据库读取，若无则回退到环境变量默认值
    """
    # 默认配置 (Env)
    default_config = {
        "serpapi": {
            "enabled": getattr(settings, "SERPAPI_SCHOLAR_ENABLED", False),
            "api_key": getattr(settings, "SERPAPI_API_KEY", "") or "",
            "engine": getattr(settings, "SERPAPI_SCHOLAR_ENGINE", "google_scholar"),
        },
        "scopus": {
            "enabled": getattr(settings, "SCOPUS_ENABLED", False),
            "api_key": getattr(settings, "SCOPUS_API_KEY", "") or "",
            "engine": None,
        },
        "rag": {
            "enabled": getattr(settings, "RAG_ENABLED", False),
        }
    }
    
    # 从 DB 读取覆盖
    saved_config = _get_setting(db, "data_sources_config", {})
    
    # 合并逻辑：以 saved_config 为主，但要确保结构完整
    # 这里简单处理：如果 saved_config 存在且结构大致对，就用它；否则用 default
    # 更严谨的做法是逐字段 merge
    
    final_config = default_config.copy()
    if saved_config and isinstance(saved_config, dict):
        # Deep merge simple 2-level dict
        for section, vals in saved_config.items():
            if section in final_config and isinstance(vals, dict):
                final_config[section].update(vals)
    
    # 脱敏 API key
    final_config["serpapi"]["api_key"] = _mask_secret(final_config["serpapi"].get("api_key", ""))
    final_config["scopus"]["api_key"] = _mask_secret(final_config["scopus"].get("api_key", ""))

    return DataSourcesConfig(**final_config)


@router.put("/settings/data-sources", response_model=DataSourcesConfig)
def update_data_sources_config(
    payload: DataSourcesConfig,
    db: Session = Depends(get_db)
) -> DataSourcesConfig:
    """
    更新运行时数据源配置并持久化到数据库
    """
    # 解析密钥：如果是 mask 值则保留原值
    original_serpapi = getattr(settings, "SERPAPI_API_KEY", "") or ""
    original_scopus = getattr(settings, "SCOPUS_API_KEY", "") or ""
    serpapi_key = _resolve_secret((payload.serpapi.api_key or "").strip(), original_serpapi)
    scopus_key = _resolve_secret((payload.scopus.api_key or "").strip(), original_scopus)

    # Elsevier API Key 一般为 32 位字母数字。这里做基础校验，防止复制时丢字符。
    if payload.scopus.enabled and scopus_key:
        if not re.fullmatch(r"[A-Za-z0-9]{32}", scopus_key):
            raise HTTPException(
                status_code=400,
                detail="Scopus API key 格式不正确（应为 32 位字母数字）",
            )

    sanitized = payload.model_dump()
    sanitized["serpapi"]["api_key"] = serpapi_key
    sanitized["scopus"]["api_key"] = scopus_key

    _set_setting(db, "data_sources_config", sanitized)

    # 立即同步到运行时 settings，避免“已保存但爬虫仍读取旧值”。
    setattr(settings, "SERPAPI_SCHOLAR_ENABLED", payload.serpapi.enabled)
    setattr(settings, "SERPAPI_API_KEY", serpapi_key)
    setattr(settings, "SERPAPI_SCHOLAR_ENGINE", payload.serpapi.engine or "google_scholar")

    setattr(settings, "SCOPUS_ENABLED", payload.scopus.enabled)
    setattr(settings, "SCOPUS_API_KEY", scopus_key)

    setattr(settings, "RAG_ENABLED", payload.rag.enabled)

    # 返回脱敏后的配置
    sanitized["serpapi"]["api_key"] = _mask_secret(serpapi_key)
    sanitized["scopus"]["api_key"] = _mask_secret(scopus_key)
    return DataSourcesConfig(**sanitized)


def _get_upstream_model_lists(api_key: str, base_url: str) -> Tuple[List[str], List[str]]:
    """
    从上游 LLM 提供方的 /models 接口动态获取模型列表。
    """
    if not api_key or not base_url:
        return [], []

    url = base_url.rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return [], []

    items = data.get("data") or []
    ids: List[str] = []
    for item in items:
        if isinstance(item, dict):
            model_id = item.get("id")
            if isinstance(model_id, str):
                ids.append(model_id)

    if not ids:
        return [], []

    embedding_models = sorted(
        {
            mid
            for mid in ids
            if "embedding" in mid.lower()
            or "embed" in mid.lower()
            or mid.lower().startswith("text-embedding")
        }
    )

    llm_models = sorted(
        {
            mid
            for mid in ids
            if mid not in embedding_models
            and "whisper" not in mid.lower()
            and "audio" not in mid.lower()
        }
    )

    return llm_models, embedding_models


@router.get("/settings/models", response_model=ModelOptionsResponse)
def get_model_options(db: Session = Depends(get_db)) -> ModelOptionsResponse:
    """
    获取当前可用的主 LLM / Embedding 模型列表及当前选择
    """
    # 1. 获取当前选中的模型 (DB > Env)
    default_llm = getattr(settings, "OPENAI_MODEL", "gpt-5.4")
    default_emb = getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")
    
    saved_selection = _get_setting(db, "model_selection_config", {})
    current_llm = saved_selection.get("llm_model", default_llm)
    current_emb = saved_selection.get("embedding_model", default_emb)
    
    # 2. 获取模型列表
    # 需要 API Key，这里也应该支持从 DB 读取 API Key (如果未来支持在前端配 Key)
    # 目前 Key 还是主要从 Env 读，或者 Settings 里的 data_sources (如果不合理，暂且从 Env)
    # 假设 OpenAI Key 还是在 Env 里配置最稳妥，或者后续加一个 System Config 页面
    
    api_key = getattr(settings, "OPENAI_API_KEY", "")
    base_url = getattr(settings, "OPENAI_BASE_URL", "")
    
    upstream_llm, upstream_embedding = _get_upstream_model_lists(api_key, base_url)

    if upstream_llm or upstream_embedding:
        llm_models = upstream_llm
        embedding_models = upstream_embedding
    else:
        llm_models = getattr(settings, "SUPPORTED_LLM_MODELS", [])
        embedding_models = getattr(settings, "SUPPORTED_EMBEDDING_MODELS", [])

    # 确保当前选择一定出现在下拉列表里
    if current_llm and current_llm not in llm_models:
        llm_models = llm_models + [current_llm]
    if current_emb and current_emb not in embedding_models:
        embedding_models = embedding_models + [current_emb]

    current_emb_dim = saved_selection.get("embedding_dimensions", getattr(settings, "EMBEDDING_DIMENSIONS", 0))
    current_screening = saved_selection.get("screening_model", getattr(settings, "SCREENING_MODEL", ""))

    return ModelOptionsResponse(
        llm_models=llm_models,
        embedding_models=embedding_models,
        current_llm_model=current_llm,
        current_embedding_model=current_emb,
        current_embedding_dimensions=current_emb_dim,
        current_screening_model=current_screening,
    )


@router.put("/settings/models", response_model=ModelOptionsResponse)
def update_model_options(
    payload: ModelSelectionConfig,
    db: Session = Depends(get_db)
) -> ModelOptionsResponse:
    """
    更新当前使用的主 LLM 模型与 Embedding 模型
    """
    # 1. 保存到 DB
    _set_setting(db, "model_selection_config", payload.model_dump())
    
    # 2. 同步更新全局 settings (运行时生效)
    setattr(settings, "OPENAI_MODEL", payload.llm_model)
    setattr(settings, "EMBEDDING_MODEL", payload.embedding_model)
    setattr(settings, "EMBEDDING_DIMENSIONS", payload.embedding_dimensions)
    setattr(settings, "SCREENING_MODEL", payload.screening_model)

    # 3. 重新构建返回 (复用 get 逻辑的简化版)
    api_key = getattr(settings, "OPENAI_API_KEY", "")
    base_url = getattr(settings, "OPENAI_BASE_URL", "")
    upstream_llm, upstream_embedding = _get_upstream_model_lists(api_key, base_url)
    
    if upstream_llm or upstream_embedding:
        llm_models = upstream_llm
        embedding_models = upstream_embedding
    else:
        llm_models = getattr(settings, "SUPPORTED_LLM_MODELS", [])
        embedding_models = getattr(settings, "SUPPORTED_EMBEDDING_MODELS", [])
        
    if payload.llm_model not in llm_models:
        llm_models.append(payload.llm_model)
    if payload.embedding_model not in embedding_models:
        embedding_models.append(payload.embedding_model)

    return ModelOptionsResponse(
        llm_models=llm_models,
        embedding_models=embedding_models,
        current_llm_model=payload.llm_model,
        current_embedding_model=payload.embedding_model,
        current_embedding_dimensions=payload.embedding_dimensions,
        current_screening_model=payload.screening_model,
    )


@router.get("/debug/external-sources/test")
def debug_external_sources_test(
    query: str = "urban design",
    max_results: int = 3,
    db: Session = Depends(get_db) # Inject DB just in case we need config from it
) -> Dict[str, Any]:
    """
    使用当前配置对外部数据源做一次快速测试调用
    """
    # 确保 Orchestrator 使用最新的配置 (可能需要从 DB 读取并注入)
    # 目前 Orchestrator 还是读 Env/Settings，
    # 如果要支持动态 Key，需要修改 Orchestrator 或在此处临时 patch settings
    
    # 临时方案：从 DB 读取配置并 patch 到 settings (仅针对本次请求上下文? 不太好做)
    # 更好的方案是 MultiSourceOrchestrator 接受 config 参数
    # 但为了最小改动，我们假设 Key 还是主要靠 Env，或者 update_data_sources_config 时没法更新 Key 到 Env
    # 如果用户在前端改了 Key，这里需要生效：
    
    saved_config = _get_setting(db, "data_sources_config", {})
    if saved_config:
        # 临时覆盖 settings 中的值 (注意这是全局修改，但在单进程/多线程模型下可能会有竞争，
        # 但对于个人使用的本地应用尚可接受，或者 Orchestrator 应该重构为传递 config)
        if "serpapi" in saved_config:
            setattr(settings, "SERPAPI_API_KEY", saved_config["serpapi"].get("api_key"))
            setattr(settings, "SERPAPI_SCHOLAR_ENABLED", saved_config["serpapi"].get("enabled"))
        if "scopus" in saved_config:
            setattr(settings, "SCOPUS_API_KEY", saved_config["scopus"].get("api_key"))
            setattr(settings, "SCOPUS_ENABLED", saved_config["scopus"].get("enabled"))

    orchestrator = MultiSourceOrchestrator()
    results: Dict[str, Any] = {}
    sources = ["scholar_serpapi", "scopus"]

    try:
        source_results = orchestrator.search_all(
            query=query,
            sources=sources,
            max_results_per_source=max_results,
        )
        for src in sources:
            papers = source_results.get(src, [])
            results[src] = {
                "count": len(papers),
            }
    except Exception as exc:
        results["error"] = str(exc)

    return {
        "query": query,
        "max_results": max_results,
        "results": results,
    }


# ---- 系统提示词管理 ----

class SystemPromptPayload(BaseModel):
    content: str = ""


@router.get("/settings/system-prompt")
def get_system_prompt_endpoint(db: Session = Depends(get_db)):
    """获取用户自定义的 Agent 系统提示词"""
    content = _get_setting(db, "agent_system_prompt", "")
    return {"content": content}


@router.put("/settings/system-prompt")
def save_system_prompt_endpoint(payload: SystemPromptPayload, db: Session = Depends(get_db)):
    """保存用户自定义的 Agent 系统提示词"""
    _set_setting(db, "agent_system_prompt", payload.content)
    return {"success": True, "message": "系统提示词已保存"}


def get_custom_system_prompt(db: Session) -> str:
    """供其他模块调用：获取用户自定义的系统提示词"""
    return _get_setting(db, "agent_system_prompt", "") or ""


# ---- Agent 配置管理 ----

@router.get("/settings/agent", response_model=AgentConfig)
def get_agent_config(db: Session = Depends(get_db)):
    """获取 Agent 的主动交互配置"""
    saved_config = _get_setting(db, "agent_config", {})
    if not saved_config:
        return AgentConfig()
    return AgentConfig(**saved_config)


@router.put("/settings/agent", response_model=AgentConfig)
def save_agent_config(payload: AgentConfig, db: Session = Depends(get_db)):
    """保存 Agent 的主动交互配置"""
    _set_setting(db, "agent_config", payload.model_dump())
    return payload


# ---- LLM 连接配置 ----


@router.get("/settings/llm-connection", response_model=LLMConnectionConfig)
def get_llm_connection(db: Session = Depends(get_db)):
    """获取 LLM API 连接配置（Key 脱敏返回）"""
    saved = _get_setting(db, "llm_connection_config", {})
    raw_key = (saved or {}).get("api_key") or getattr(settings, "OPENAI_API_KEY", "") or ""
    base_url = (saved or {}).get("base_url") or getattr(settings, "OPENAI_BASE_URL", "https://api.openai.com/v1") or "https://api.openai.com/v1"
    return LLMConnectionConfig(
        api_key=_mask_secret(raw_key),
        base_url=base_url,
    )


@router.put("/settings/llm-connection", response_model=LLMConnectionConfig)
def save_llm_connection(payload: LLMConnectionConfig, db: Session = Depends(get_db)):
    """保存 LLM API 连接配置，运行时立即生效"""
    # 解析密钥：如果是 mask 值则保留原值
    original_key = getattr(settings, "OPENAI_API_KEY", "") or ""
    real_key = _resolve_secret(payload.api_key, original_key)

    save_data = {"api_key": real_key, "base_url": payload.base_url}
    _set_setting(db, "llm_connection_config", save_data)

    # 运行时热更新
    if real_key:
        setattr(settings, "OPENAI_API_KEY", real_key)
    if payload.base_url:
        setattr(settings, "OPENAI_BASE_URL", payload.base_url)

    return LLMConnectionConfig(api_key=_mask_secret(real_key), base_url=payload.base_url)


# ---- 综述生成默认值 ----


@router.get("/settings/review-defaults", response_model=ReviewDefaultsConfig)
def get_review_defaults(db: Session = Depends(get_db)):
    """获取综述生成的默认参数"""
    saved = _get_setting(db, "review_defaults_config", {})
    if saved and isinstance(saved, dict):
        return ReviewDefaultsConfig(**saved)
    return ReviewDefaultsConfig()


@router.put("/settings/review-defaults", response_model=ReviewDefaultsConfig)
def save_review_defaults(payload: ReviewDefaultsConfig, db: Session = Depends(get_db)):
    """保存综述生成的默认参数"""
    _set_setting(db, "review_defaults_config", payload.model_dump())
    return payload


# ---- 爬虫配置 ----


@router.get("/settings/crawler", response_model=CrawlerConfig)
def get_crawler_config(db: Session = Depends(get_db)):
    """获取爬虫配置"""
    saved = _get_setting(db, "crawler_config", {})
    default = CrawlerConfig(
        delay_min=getattr(settings, "CRAWLER_DELAY_MIN", 1),
        delay_max=getattr(settings, "CRAWLER_DELAY_MAX", 3),
        max_retries=getattr(settings, "CRAWLER_MAX_RETRIES", 3),
        timeout=getattr(settings, "CRAWLER_TIMEOUT", 30),
    )
    if saved and isinstance(saved, dict):
        return CrawlerConfig(
            delay_min=saved.get("delay_min", default.delay_min),
            delay_max=saved.get("delay_max", default.delay_max),
            max_retries=saved.get("max_retries", default.max_retries),
            timeout=saved.get("timeout", default.timeout),
        )
    return default


@router.put("/settings/crawler", response_model=CrawlerConfig)
def save_crawler_config(payload: CrawlerConfig, db: Session = Depends(get_db)):
    """保存爬虫配置，运行时立即生效"""
    _set_setting(db, "crawler_config", payload.model_dump())
    # 运行时热更新
    setattr(settings, "CRAWLER_DELAY_MIN", payload.delay_min)
    setattr(settings, "CRAWLER_DELAY_MAX", payload.delay_max)
    setattr(settings, "CRAWLER_MAX_RETRIES", payload.max_retries)
    setattr(settings, "CRAWLER_TIMEOUT", payload.timeout)
    return payload


# ---- 语义检索配置 ----


@router.get("/settings/search", response_model=SearchConfig)
def get_search_config(db: Session = Depends(get_db)):
    """获取语义检索配置"""
    saved = _get_setting(db, "search_config", {})
    if saved and isinstance(saved, dict):
        return SearchConfig(**saved)
    return SearchConfig()


@router.put("/settings/search", response_model=SearchConfig)
def save_search_config(payload: SearchConfig, db: Session = Depends(get_db)):
    """保存语义检索配置"""
    _set_setting(db, "search_config", payload.model_dump())


# ---- 机构访问配置 ----


class InstitutionalAccessConfig(BaseModel):
    enabled: bool = False
    institution_name: str = ""
    auth_type: str = Field(default="ezproxy", description="ezproxy | shibboleth")
    login_url: str = ""
    ezproxy_prefix: str = ""
    username: str = ""
    password: str = ""
    headless: bool = True


@router.get("/settings/institutional-access", response_model=InstitutionalAccessConfig)
def get_institutional_access_config(db: Session = Depends(get_db)):
    """获取机构访问配置"""
    saved = _get_setting(db, "institutional_access_config", {})
    default = InstitutionalAccessConfig(
        enabled=getattr(settings, "INSTITUTIONAL_ENABLED", False),
        institution_name=getattr(settings, "INSTITUTIONAL_NAME", ""),
        auth_type=getattr(settings, "INSTITUTIONAL_AUTH_TYPE", "ezproxy"),
        login_url=getattr(settings, "INSTITUTIONAL_LOGIN_URL", ""),
        ezproxy_prefix=getattr(settings, "INSTITUTIONAL_EZPROXY_PREFIX", ""),
        username=getattr(settings, "INSTITUTIONAL_USERNAME", ""),
        password=getattr(settings, "INSTITUTIONAL_PASSWORD", ""),
        headless=getattr(settings, "SELENIUM_HEADLESS", True),
    )
    if saved and isinstance(saved, dict):
        cfg = InstitutionalAccessConfig(
            enabled=saved.get("enabled", default.enabled),
            institution_name=saved.get("institution_name", default.institution_name),
            auth_type=saved.get("auth_type", default.auth_type),
            login_url=saved.get("login_url", default.login_url),
            ezproxy_prefix=saved.get("ezproxy_prefix", default.ezproxy_prefix),
            username=saved.get("username", default.username),
            password=saved.get("password", default.password),
            headless=saved.get("headless", default.headless),
        )
    else:
        cfg = default
    # 脱敏
    cfg.password = _mask_secret(cfg.password, show_prefix=0, show_suffix=0) if cfg.password else ""
    return cfg


@router.put("/settings/institutional-access", response_model=InstitutionalAccessConfig)
def save_institutional_access_config(
    payload: InstitutionalAccessConfig,
    db: Session = Depends(get_db),
):
    """保存机构访问配置，运行时立即生效"""
    # 解析密码：如果是 mask 值则保留原值
    original_password = getattr(settings, "INSTITUTIONAL_PASSWORD", "") or ""
    real_password = _resolve_secret(payload.password, original_password)

    save_data = payload.model_dump()
    save_data["password"] = real_password
    _set_setting(db, "institutional_access_config", save_data)

    # 运行时热更新
    setattr(settings, "INSTITUTIONAL_ENABLED", payload.enabled)
    setattr(settings, "INSTITUTIONAL_NAME", payload.institution_name)
    setattr(settings, "INSTITUTIONAL_AUTH_TYPE", payload.auth_type)
    setattr(settings, "INSTITUTIONAL_LOGIN_URL", payload.login_url)
    setattr(settings, "INSTITUTIONAL_EZPROXY_PREFIX", payload.ezproxy_prefix)
    setattr(settings, "INSTITUTIONAL_USERNAME", payload.username)
    setattr(settings, "INSTITUTIONAL_PASSWORD", real_password)
    setattr(settings, "SELENIUM_HEADLESS", payload.headless)

    # 返回脱敏
    payload.password = _mask_secret(real_password, show_prefix=0, show_suffix=0) if real_password else ""
    return payload


@router.post("/settings/institutional-access/test")
def test_institutional_login(db: Session = Depends(get_db)):
    """测试机构登录"""
    from app.services.institutional_auth import get_institutional_auth_service

    saved = _get_setting(db, "institutional_access_config", {})
    if not saved:
        raise HTTPException(status_code=400, detail="未配置机构访问信息")

    config = InstitutionalAccessConfig(**saved)
    if not config.login_url or not config.username or not config.password:
        raise HTTPException(status_code=400, detail="登录 URL、用户名、密码不能为空")

    auth_service = get_institutional_auth_service()
    success = auth_service.login(
        login_url=config.login_url,
        username=config.username,
        password=config.password,
        auth_type=config.auth_type,
        headless=config.headless,
    )

    if success:
        return {
            "success": True,
            "message": "机构登录成功",
            "status": auth_service.get_status(),
        }
    else:
        return {
            "success": False,
            "message": "机构登录失败，请检查凭据或尝试关闭 headless 模式",
            "status": auth_service.get_status(),
        }


@router.get("/settings/institutional-access/status")
def get_institutional_session_status():
    """查询机构认证 session 状态"""
    from app.services.institutional_auth import get_institutional_auth_service

    auth_service = get_institutional_auth_service()
    status = auth_service.get_status()
    status["session_healthy"] = auth_service.check_session_health() if status["authenticated"] else False
    return status


# ---- 学科配置 (Discipline Profile) ----


class DisciplinePresetSaveRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="预设名称")
    profile: Dict[str, Any] = Field(..., description="DisciplineProfile 字典")


@router.get("/settings/discipline-profile")
def get_discipline_profile_endpoint(db: Session = Depends(get_db)):
    """获取当前学科配置"""
    from app.services.llm.prompts import get_discipline_profile
    profile = get_discipline_profile(db)
    return profile.model_dump()


@router.put("/settings/discipline-profile")
def save_discipline_profile_endpoint(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """保存/更新当前学科配置"""
    from app.services.llm.prompts import DisciplineProfile, save_discipline_profile
    profile = DisciplineProfile(**payload)
    save_discipline_profile(db, profile)
    return {"success": True, "message": "学科配置已保存", "profile": profile.model_dump()}


@router.get("/settings/discipline-presets")
def list_discipline_presets(db: Session = Depends(get_db)):
    """获取所有已保存的学科预设列表"""
    saved = _get_setting(db, "discipline_presets", {})
    if not saved or not isinstance(saved, dict):
        saved = {}
    # 返回预设名称列表和简要信息
    presets = []
    for name, profile_data in saved.items():
        presets.append({
            "name": name,
            "field_name": profile_data.get("field_name", "Unknown"),
        })
    return {"presets": presets}


@router.post("/settings/discipline-presets")
def save_discipline_preset(
    payload: DisciplinePresetSaveRequest,
    db: Session = Depends(get_db),
):
    """将当前学科配置另存为命名预设"""
    from app.services.llm.prompts import DisciplineProfile
    # 验证 profile 数据合法性
    profile = DisciplineProfile(**payload.profile)
    
    # 读取现有预设
    saved = _get_setting(db, "discipline_presets", {})
    if not saved or not isinstance(saved, dict):
        saved = {}
    
    saved[payload.name] = profile.model_dump()
    _set_setting(db, "discipline_presets", saved)
    
    return {"success": True, "message": f"预设 '{payload.name}' 已保存"}


@router.delete("/settings/discipline-presets/{name}")
def delete_discipline_preset(name: str, db: Session = Depends(get_db)):
    """删除指定的学科预设"""
    saved = _get_setting(db, "discipline_presets", {})
    if not saved or not isinstance(saved, dict) or name not in saved:
        return {"success": False, "message": f"预设 '{name}' 不存在"}
    
    del saved[name]
    _set_setting(db, "discipline_presets", saved)
    return {"success": True, "message": f"预设 '{name}' 已删除"}


@router.post("/settings/discipline-presets/{name}/load")
def load_discipline_preset(name: str, db: Session = Depends(get_db)):
    """加载指定预设为当前学科配置"""
    from app.services.llm.prompts import DisciplineProfile, save_discipline_profile
    
    saved = _get_setting(db, "discipline_presets", {})
    if not saved or not isinstance(saved, dict) or name not in saved:
        return {"success": False, "message": f"预设 '{name}' 不存在"}
    
    profile = DisciplineProfile(**saved[name])
    save_discipline_profile(db, profile)
    return {"success": True, "message": f"已加载预设 '{name}'", "profile": profile.model_dump()}
    return payload
