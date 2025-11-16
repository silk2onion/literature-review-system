"""
语义检索 HTTP API

提供基于 Paper.embedding 的语义检索能力，返回检索结果和调试信息。
"""

from dataclasses import asdict
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.schemas.semantic_search import (
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticSearchItem,
    SemanticSearchDebug,
)
from app.schemas.paper import PaperResponse
from app.services.semantic_search import get_semantic_search_service
from app.services.embedding_service import get_embedding_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/semantic-search",
    tags=["semantic_search"],
)


@router.post("/search", response_model=SemanticSearchResponse)
async def semantic_search(
    payload: SemanticSearchRequest,
    db: Session = Depends(get_db),
) -> SemanticSearchResponse:
    """
    在本地 Paper.embedding 上执行语义检索。

    - 使用 SemanticSearchService 进行语义组扩展与向量相似度检索
    - 返回排好序的命中文献列表及调试信息
    """
    try:
        service = get_semantic_search_service()
        hits, debug_info = await service.search(
            db=db,
            keywords=payload.keywords,
            year_from=payload.year_from,
            year_to=payload.year_to,
            limit=payload.limit,
            source="semantic_search_http",
        )

        items: List[SemanticSearchItem] = [
            SemanticSearchItem(
                paper=PaperResponse.model_validate(hit.paper),
                score=hit.score,
            )
            for hit in hits
        ]

        debug = SemanticSearchDebug(
            expanded_keywords=debug_info.expanded_keywords,
            activated_groups={
                key: asdict(group) for key, group in debug_info.activated_groups.items()
            },
            total_candidates=debug_info.total_candidates,
        )

        return SemanticSearchResponse(
            success=True,
            items=items,
            debug=debug,
            message=f"命中 {len(items)} 篇文献（候选 {debug.total_candidates} 篇）",
        )
    except HTTPException:
        # 直接抛出的 HTTPException 透传
        raise
    except Exception as exc:
        logger.exception("语义检索接口失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"语义检索失败: {exc}")


class BackfillEmbeddingsRequest(BaseModel):
    """
    触发 Paper.embedding 批量回填的请求体。

    limit: 本次最多处理多少条缺少 embedding 的 Paper，默认 100。
    """
    limit: int = 100


@router.post("/backfill-embeddings")
async def backfill_embeddings(
    payload: BackfillEmbeddingsRequest,
    db: Session = Depends(get_db),
) -> dict:
    """
    为缺少 embedding 的 Paper 批量生成向量并回填到数据库。

    典型用法：
    - 初次建立向量“索引”：在已有文献基础上批量生成 Paper.embedding
    - 后续可以根据需要重复调用，用于补齐新抓取但尚未回填的文献

    注意：该操作可能较耗时，建议分批多次调用（通过 limit 控制单次处理数量）。
    """
    service = get_embedding_service()
    try:
        updated = await service.backfill_missing_embeddings(db=db, limit=payload.limit)
    except Exception as exc:
        logger.exception("批量回填 Paper.embedding 失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"批量回填 embedding 失败: {exc}")

    return {
        "success": True,
        "updated": updated,
        "message": f"本次成功回填 {updated} 条 Paper.embedding",
    }


@router.websocket("/ws")
async def semantic_search_ws(websocket: WebSocket) -> None:
    """
    语义检索 WebSocket 接口

    协议说明：
    - 客户端发送: {"type": "search", "payload": SemanticSearchRequest 兼容字段}
    - 服务端返回:
      - {"type": "debug", "debug": {...}, "message": "..."} 调试信息
      - {"type": "partial_result", "items": [...], "progress": {"current": n, "total": m}}
      - {"type": "done", "total": m}
      - {"type": "error", "message": "..."} 发生错误时
    """
    await websocket.accept()
    db: Session = SessionLocal()
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type != "search":
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": f"不支持的消息类型: {msg_type}",
                    }
                )
                continue

            raw_payload = data.get("payload") or {}
            try:
                payload = SemanticSearchRequest(**raw_payload)
            except Exception as exc:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": f"请求参数无效: {exc}",
                    }
                )
                continue

            service = get_semantic_search_service()
            hits, debug_info = await service.search(
                db=db,
                keywords=payload.keywords,
                year_from=payload.year_from,
                year_to=payload.year_to,
                limit=payload.limit,
                source="semantic_search_ws",
            )

            # 先发送调试信息
            await websocket.send_json(
                {
                    "type": "debug",
                    "debug": {
                        "expanded_keywords": debug_info.expanded_keywords,
                        "activated_groups": {
                            key: asdict(group)
                            for key, group in debug_info.activated_groups.items()
                        },
                        "total_candidates": debug_info.total_candidates,
                    },
                    "message": f"命中 {len(hits)} 篇文献（候选 {debug_info.total_candidates} 篇）",
                }
            )

            # 然后按批次推送检索结果
            total = len(hits)
            if total == 0:
                await websocket.send_json({"type": "done", "total": 0})
                continue

            # 每批次推送的最大数量，避免单条消息过大
            chunk_size = max(1, min(payload.limit, 20))
            sent = 0

            while sent < total:
                chunk = hits[sent : sent + chunk_size]
                items = [
                    {
                        "paper": PaperResponse.model_validate(hit.paper).model_dump(),
                        "score": hit.score,
                    }
                    for hit in chunk
                ]
                sent += len(chunk)

                await websocket.send_json(
                    {
                        "type": "partial_result",
                        "items": items,
                        "progress": {
                            "current": sent,
                            "total": total,
                        },
                    }
                )

            await websocket.send_json({"type": "done", "total": total})
    except WebSocketDisconnect:
        logger.info("语义检索 WebSocket 连接断开")
    except Exception as exc:  # pragma: no cover - 防御性日志
        logger.exception("语义检索 WebSocket 处理异常: %s", exc)
        try:
            await websocket.send_json(
                {"type": "error", "message": f"服务器内部错误: {exc}"}
            )
        except Exception:
            # 连接已断开，不再尝试发送
            pass
    finally:
        db.close()
        await websocket.close()