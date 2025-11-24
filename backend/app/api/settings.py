from typing import Any, Dict, List, Optional, Tuple
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
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


class ModelOptionsResponse(BaseModel):
    llm_models: List[str]
    embedding_models: List[str]
    current_llm_model: str
    current_embedding_model: str


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
    
    return DataSourcesConfig(**final_config)


@router.put("/settings/data-sources", response_model=DataSourcesConfig)
def update_data_sources_config(
    payload: DataSourcesConfig, 
    db: Session = Depends(get_db)
) -> DataSourcesConfig:
    """
    更新运行时数据源配置并持久化到数据库
    """
    _set_setting(db, "data_sources_config", payload.model_dump())
    return payload


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
    default_llm = getattr(settings, "OPENAI_MODEL", "gpt-4")
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

    return ModelOptionsResponse(
        llm_models=llm_models,
        embedding_models=embedding_models,
        current_llm_model=current_llm,
        current_embedding_model=current_emb,
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