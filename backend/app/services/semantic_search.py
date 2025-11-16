import logging
from dataclasses import dataclass
from math import sqrt
from typing import Any, Dict, List, Optional, Tuple, cast

from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.recall_log import RecallLog
from app.models.tag import PaperTag
from app.services.embedding_service import get_embedding_service
from app.services.semantic_groups import ActivatedGroup, get_semantic_group_service

logger = logging.getLogger(__name__)


@dataclass
class SemanticSearchHit:
    paper: Paper
    score: float


@dataclass
class SemanticSearchDebugInfo:
    expanded_keywords: List[str]
    activated_groups: Dict[str, ActivatedGroup]
    total_candidates: int


class SemanticSearchService:
    """
    语义检索服务：
    - 使用语义组扩展关键词
    - 基于 EmbeddingService 为查询生成向量
    - 在已有 Paper.embedding 上做相似度检索
    """

    def __init__(self) -> None:
        self._embedding = get_embedding_service()
        self._groups = get_semantic_group_service()

    @staticmethod
    def _cosine_similarity(q: List[float], v: List[float]) -> float:
        if not q or not v:
            return 0.0
        if len(q) != len(v):
            # 维度不一致直接忽略
            return 0.0
        dot = 0.0
        sq_q = 0.0
        sq_v = 0.0
        for a, b in zip(q, v):
            dot += a * b
            sq_q += a * a
            sq_v += b * b
        if sq_q == 0.0 or sq_v == 0.0:
            return 0.0
        return dot / (sqrt(sq_q) * sqrt(sq_v))

    def _apply_tag_recall_enhancement(
        self,
        db: Session,
        hits: List[SemanticSearchHit],
        max_seed: int = 50,
        alpha: float = 0.3,
    ) -> Tuple[List[SemanticSearchHit], Dict[str, Any]]:
        """
        基于标签共现的简单召回增强：
        - 取前 max_seed 条命中作为“种子集合”
        - 统计这些文献上出现的标签（使用 paper_tags 表）
        - 计算每个标签的权重（按出现次数与关联权重归一化）
        - 对所有命中文献，根据其携带的标签权重对原始相似度做加性重排
        """
        if not hits:
            return hits, {"enabled": False, "reason": "no_hits"}

        # 仅对有 ID 的文献进行处理
        seed_hits = hits[:max_seed]
        seed_paper_ids: List[int] = []
        for h in seed_hits:
            pid = getattr(h.paper, "id", None)
            if pid is not None:
                try:
                    seed_paper_ids.append(int(pid))
                except Exception:
                    continue
        if not seed_paper_ids:
            return hits, {"enabled": False, "reason": "no_seed_ids"}

        # 读取种子文献上的标签
        rows: List[PaperTag] = (
            db.query(PaperTag)
            .filter(PaperTag.paper_id.in_(seed_paper_ids))
            .all()
        )
        if not rows:
            return hits, {"enabled": False, "reason": "no_seed_tags"}

        tag_counts: Dict[int, float] = {}
        paper_tags_map: Dict[int, List[PaperTag]] = {}
        for pt in rows:
            # ORM 实例上的 tag_id / paper_id / weight 在类型检查器中仍表现为 Column，需要显式转换
            try:
                tag_id = int(getattr(pt, "tag_id"))
                paper_id = int(getattr(pt, "paper_id"))
            except Exception:
                # 若存在异常数据则直接跳过
                continue
            weight_obj = getattr(pt, "weight", None)
            w = float(weight_obj) if weight_obj is not None else 1.0
            tag_counts[tag_id] = tag_counts.get(tag_id, 0.0) + w
            paper_tags_map.setdefault(paper_id, []).append(pt)

        max_count = max(tag_counts.values()) if tag_counts else 0.0
        if max_count <= 0.0:
            return hits, {"enabled": False, "reason": "zero_tag_counts"}

        # 标签权重归一化到 [0,1]
        tag_boost: Dict[int, float] = {
            tag_id: c / max_count for tag_id, c in tag_counts.items()
        }

        # 为所有命中文献补齐 tags 映射
        all_paper_ids: List[int] = []
        for h in hits:
            pid = getattr(h.paper, "id", None)
            if pid is None:
                continue
            try:
                pid_int = int(pid)
            except Exception:
                continue
            all_paper_ids.append(pid_int)
        remaining_ids = [pid for pid in all_paper_ids if pid not in paper_tags_map]
        if remaining_ids:
            more_rows: List[PaperTag] = (
                db.query(PaperTag)
                .filter(PaperTag.paper_id.in_(remaining_ids))
                .all()
            )
            for pt in more_rows:
                try:
                    paper_id = int(getattr(pt, "paper_id"))
                except Exception:
                    # 数据异常则跳过
                    continue
                paper_tags_map.setdefault(paper_id, []).append(pt)

        # 计算每篇文献的标签信号得分
        paper_tag_score: Dict[int, float] = {}
        for pid, pts in paper_tags_map.items():
            score_sum = 0.0
            for pt in pts:
                try:
                    tag_id = int(getattr(pt, "tag_id"))
                except Exception:
                    continue
                boost = tag_boost.get(tag_id)
                if not boost:
                    continue
                weight_obj = getattr(pt, "weight", None)
                w = float(weight_obj) if weight_obj is not None else 1.0
                score_sum += boost * w
            paper_tag_score[pid] = score_sum

        max_tag_score = max(paper_tag_score.values()) if paper_tag_score else 0.0
        if max_tag_score <= 0.0:
            return hits, {
                "enabled": False,
                "reason": "zero_paper_tag_scores",
                "tag_count": len(tag_boost),
            }

        # 基于标签信号对相似度做加性增强：new_score = emb_score + alpha * norm_tag_score
        enhanced_hits: List[SemanticSearchHit] = []
        for h in hits:
            pid = getattr(h.paper, "id", None)
            tag_signal = 0.0
            if pid is not None:
                try:
                    pid_int = int(pid)
                except Exception:
                    pid_int = None
                if pid_int is not None and pid_int in paper_tag_score:
                    tag_signal = paper_tag_score[pid_int] / max_tag_score
            new_score = float(h.score) + alpha * float(tag_signal)
            enhanced_hits.append(SemanticSearchHit(paper=h.paper, score=new_score))

        enhanced_hits.sort(key=lambda x: x.score, reverse=True)

        debug: Dict[str, Any] = {
            "enabled": True,
            "alpha": alpha,
            "seed_size": len(seed_paper_ids),
            "tag_count": len(tag_boost),
        }
        return enhanced_hits, debug

    async def search(
        self,
        db: Session,
        keywords: List[str],
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        limit: int = 20,
        source: Optional[str] = None,
    ) -> Tuple[List[SemanticSearchHit], SemanticSearchDebugInfo]:
        """
        在本地 Paper.embedding 上做语义检索。
        """
        if not keywords:
            return [], SemanticSearchDebugInfo(
                expanded_keywords=[],
                activated_groups={},
                total_candidates=0,
            )

        # 1) 使用语义组扩展关键词
        expand_res: Dict[str, Any] = self._groups.expand_keywords(
            keywords=keywords,
            text=" ".join(keywords),
        )
        expanded_keywords = cast(List[str], expand_res.get("keywords", []))
        activated_groups = cast(Dict[str, ActivatedGroup], expand_res.get("activated_groups", {}))

        # 2) 为查询生成向量
        query_text = ", ".join(expanded_keywords)
        query_vec = await self._embedding.embed_text(query_text)
        if query_vec is None:
            logger.warning("SemanticSearch: 查询向量生成失败，返回空结果")
            return [], SemanticSearchDebugInfo(
                expanded_keywords=expanded_keywords,
                activated_groups=activated_groups,
                total_candidates=0,
            )

        # 3) 取出所有有 embedding 的候选论文
        q = db.query(Paper).filter(Paper.embedding.isnot(None))
        if year_from is not None:
            q = q.filter(Paper.year >= year_from)
        if year_to is not None:
            q = q.filter(Paper.year <= year_to)

        candidates: List[Paper] = q.all()
        hits: List[SemanticSearchHit] = []
 
        # 3.1) 正常情况下，仅保留相似度为正的命中结果
        for p in candidates:
            vec = getattr(p, "embedding", None)
            if not isinstance(vec, list):
                continue
            # embedding 可能是 list[float] 或 list[Any]，做一次安全转换
            try:
                vec_floats = [float(x) for x in vec]
            except Exception:
                continue
            score = self._cosine_similarity(query_vec, vec_floats)
            if score <= 0.0:
                continue
            hits.append(SemanticSearchHit(paper=p, score=score))
 
        # 3.2) 回退策略：若没有任何正相似度命中，但仍有候选文献，则按原始分数返回 top-k
        if not hits and candidates:
            fallback_hits: List[SemanticSearchHit] = []
            for p in candidates:
                vec = getattr(p, "embedding", None)
                if not isinstance(vec, list):
                    continue
                try:
                    vec_floats = [float(x) for x in vec]
                except Exception:
                    continue
                score = self._cosine_similarity(query_vec, vec_floats)
                fallback_hits.append(SemanticSearchHit(paper=p, score=score))
            if fallback_hits:
                logger.info(
                    "SemanticSearch: 无正相似度命中，使用回退策略返回 top-%d 结果",
                    min(limit, len(fallback_hits)) if limit > 0 else len(fallback_hits),
                )
                hits = fallback_hits
 
        # 4) 按相似度排序并截断
        hits.sort(key=lambda h: h.score, reverse=True)
        if limit > 0:
            hits = hits[:limit]

        # 4.1) 标签网召回增强（基于 PaperTag 的简单重排）
        tag_recall_debug: Dict[str, Any] = {}
        try:
            hits, tag_recall_debug = self._apply_tag_recall_enhancement(db=db, hits=hits)
        except Exception:
            logger.exception("标签网召回增强失败", exc_info=True)

        debug = SemanticSearchDebugInfo(
            expanded_keywords=expanded_keywords,
            activated_groups=activated_groups,
            total_candidates=len(candidates),
        )

        # 5) 记录召回日志（查询级别）
        try:
            event_source = source or "semantic_search"
            group_keys = list(activated_groups.keys()) if activated_groups else None
            results_summary = [
                {
                    "paper_id": int(getattr(hit.paper, "id")),
                    "score": float(hit.score),
                }
                for hit in hits
                if getattr(hit.paper, "id", None) is not None
            ]
            log = RecallLog(
                event_type="query",
                source=event_source,
                query_keywords=keywords,
                group_keys=group_keys,
                paper_id=None,
                rank=None,
                score=None,
                extra={
                    "expanded_keywords": expanded_keywords,
                    "total_candidates": len(candidates),
                    "returned_count": len(hits),
                    "results": results_summary,
                    "tag_recall": tag_recall_debug,
                },
            )
            db.add(log)
            db.commit()
        except Exception:
            logger.exception("记录语义检索召回日志失败", exc_info=True)

        return hits, debug


_semantic_search_service: Optional["SemanticSearchService"] = None


def get_semantic_search_service() -> "SemanticSearchService":
    global _semantic_search_service
    if _semantic_search_service is None:
        _semantic_search_service = SemanticSearchService()
    return _semantic_search_service