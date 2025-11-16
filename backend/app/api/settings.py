from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter
from pydantic import BaseModel
import requests

from app.config import settings
from app.services.crawler.multi_source_orchestrator import MultiSourceOrchestrator

router = APIRouter(prefix="/api", tags=["settings"])


# ---- 运行时数据源配置（简单进程内存实现，占位版） ----


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


# 初始化时从 settings 读默认值
_runtime_config: DataSourcesConfig = DataSourcesConfig(
    serpapi=DataSourceConfig(
        enabled=getattr(settings, "SERPAPI_SCHOLAR_ENABLED", False),
        api_key=getattr(settings, "SERPAPI_API_KEY", "") or "",
        engine=getattr(settings, "SERPAPI_SCHOLAR_ENGINE", "google_scholar"),
    ),
    scopus=DataSourceConfig(
        enabled=getattr(settings, "SCOPUS_ENABLED", False),
        api_key=getattr(settings, "SCOPUS_API_KEY", "") or "",
        engine=None,
    ),
    rag=RagConfig(
        enabled=getattr(settings, "RAG_ENABLED", False),
    ),
)


# ---- LLM / Embedding 模型配置（运行时选择） ----


class ModelSelectionConfig(BaseModel):
    llm_model: str
    embedding_model: str


class ModelOptionsResponse(BaseModel):
    llm_models: List[str]
    embedding_models: List[str]
    current_llm_model: str
    current_embedding_model: str


_runtime_model_config: ModelSelectionConfig = ModelSelectionConfig(
    llm_model=getattr(settings, "OPENAI_MODEL", "gpt-4"),
    embedding_model=getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small"),
)


@router.get("/settings/data-sources", response_model=DataSourcesConfig)
def get_data_sources_config() -> DataSourcesConfig:
    """
    获取当前运行时数据源配置

    当前实现为进程内存中的简单配置，
    后续可以替换为数据库或文件存储。
    """
    return _runtime_config


@router.put("/settings/data-sources", response_model=DataSourcesConfig)
def update_data_sources_config(payload: DataSourcesConfig) -> DataSourcesConfig:
    """
    更新运行时数据源配置

    注意：当前仅更新内存中的配置，不会写回 .env。
    """
    global _runtime_config
    _runtime_config = payload
    return _runtime_config


def _get_upstream_model_lists() -> Tuple[List[str], List[str]]:
    """
    从上游 LLM 提供方的 /models 接口动态获取模型列表。

    返回:
        (llm_models, embedding_models)
    """
    api_key = getattr(settings, "OPENAI_API_KEY", "")
    base_url = getattr(settings, "OPENAI_BASE_URL", "")

    if not api_key or not base_url:
        return [], []

    url = base_url.rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        # 上游不可用时，让调用方走本地 SUPPORTED_* 回退逻辑
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

    # 简单启发式：包含 embedding/embed/text-embedding 的认为是 embedding 模型
    embedding_models = sorted(
        {
            mid
            for mid in ids
            if "embedding" in mid.lower()
            or "embed" in mid.lower()
            or mid.lower().startswith("text-embedding")
        }
    )

    # 其它模型（排除 whisper/audio 之类）认为是 LLM 模型
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
def get_model_options() -> ModelOptionsResponse:
    """
    获取当前可用的主 LLM / Embedding 模型列表及当前选择

    优先从上游 LLM 提供方的 /models 接口动态获取；
    如果获取失败，则回退到 settings.SUPPORTED_LLM_MODELS / SUPPORTED_EMBEDDING_MODELS。
    """
    upstream_llm, upstream_embedding = _get_upstream_model_lists()

    if upstream_llm or upstream_embedding:
        llm_models = upstream_llm
        embedding_models = upstream_embedding
    else:
        llm_models = getattr(settings, "SUPPORTED_LLM_MODELS", [])
        embedding_models = getattr(settings, "SUPPORTED_EMBEDDING_MODELS", [])

    # 确保当前选择一定出现在下拉列表里
    if _runtime_model_config.llm_model and _runtime_model_config.llm_model not in llm_models:
        llm_models = llm_models + [_runtime_model_config.llm_model]
    if (
        _runtime_model_config.embedding_model
        and _runtime_model_config.embedding_model not in embedding_models
    ):
        embedding_models = embedding_models + [_runtime_model_config.embedding_model]

    return ModelOptionsResponse(
        llm_models=llm_models,
        embedding_models=embedding_models,
        current_llm_model=_runtime_model_config.llm_model,
        current_embedding_model=_runtime_model_config.embedding_model,
    )


@router.put("/settings/models", response_model=ModelOptionsResponse)
def update_model_options(payload: ModelSelectionConfig) -> ModelOptionsResponse:
    """
    更新当前使用的主 LLM 模型与 Embedding 模型

    注意：
    - 当前主要更新进程内运行时配置（_runtime_model_config）
    - 同时更新 settings.OPENAI_MODEL / settings.EMBEDDING_MODEL，便于服务层按运行时配置读取
    """
    global _runtime_model_config
    _runtime_model_config = payload

    # 同步更新全局 settings 中的模型名，支持运行时动态切换
    setattr(settings, "OPENAI_MODEL", payload.llm_model)
    setattr(settings, "EMBEDDING_MODEL", payload.embedding_model)

    # 更新后重新获取上游模型列表，保持与 GET /settings/models 行为一致
    upstream_llm, upstream_embedding = _get_upstream_model_lists()

    if upstream_llm or upstream_embedding:
        llm_models = upstream_llm
        embedding_models = upstream_embedding
    else:
        llm_models = getattr(settings, "SUPPORTED_LLM_MODELS", [])
        embedding_models = getattr(settings, "SUPPORTED_EMBEDDING_MODELS", [])

    # 确保当前选择出现在返回列表中
    if _runtime_model_config.llm_model and _runtime_model_config.llm_model not in llm_models:
        llm_models = llm_models + [_runtime_model_config.llm_model]
    if (
        _runtime_model_config.embedding_model
        and _runtime_model_config.embedding_model not in embedding_models
    ):
        embedding_models = embedding_models + [_runtime_model_config.embedding_model]

    return ModelOptionsResponse(
        llm_models=llm_models,
        embedding_models=embedding_models,
        current_llm_model=_runtime_model_config.llm_model,
        current_embedding_model=_runtime_model_config.embedding_model,
    )


# ---- 外部数据源测试接口 ----


@router.get("/debug/external-sources/test")
def debug_external_sources_test(
    query: str = "urban design",
    max_results: int = 3,
) -> Dict[str, Any]:
    """
    使用当前配置对外部数据源做一次快速测试调用（不入库）。

    - 调用 MultiSourceOrchestrator.search_all
    - 汇总每个 source 的返回数量或错误信息
    """
    orchestrator = MultiSourceOrchestrator()
    results: Dict[str, Any] = {}

    # 目前 MultiSourceOrchestrator 内部固定支持的源名称
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
                # 这里没有直接暴露 HTTP 状态码，只给出数量；
                # 后续如果需要，可以在各 crawler 内部记录最近一次 HTTP 状态到全局状态中再读出。
            }
    except Exception as exc:  # 防御式：不让调试接口把异常抛到客户端
        results["error"] = str(exc)

    return {
        "query": query,
        "max_results": max_results,
        "results": results,
    }