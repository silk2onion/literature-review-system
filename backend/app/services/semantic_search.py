import logging
from dataclasses import dataclass
from math import sqrt
from typing import Any, Dict, List, Optional, Tuple, cast

from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.recall_log import RecallLog
from app.models.tag import PaperTag, TagGroupTag
from app.models.citation import PaperCitation
from app.services.embedding_service import get_embedding_service
from app.services.semantic_groups import ActivatedGroup, get_semantic_group_service
from app.services.recall_enhancement import RecallEnhancementService

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
        use_graph_propagation: bool = True,
    ) -> Tuple[List[SemanticSearchHit], Dict[str, Any]]:
        """
        基于标签共现与图传播的召回增强：
        1. 种子选择：取前 max_seed 条 embedding 检索命中作为“种子集合”。
        2. 标签共现：统计种子文献上的标签，计算基础标签权重。
        3. 图传播 (Graph Propagation)：
           - 标签组传播：若标签属于某标签组，将权重传播给组内其他标签。
           - 引用传播：(可选) 若种子文献引用了其他文献，给予被引文献额外加权。
        4. 重排：对所有候选文献，计算其携带标签的综合权重，叠加到原始相似度上。
        """
        if not hits:
            return hits, {"enabled": False, "reason": "no_hits"}

        # 1. 确定种子文献 ID
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

        # 2. 读取种子文献上的标签 (PaperTag)
        rows: List[PaperTag] = (
            db.query(PaperTag)
            .filter(PaperTag.paper_id.in_(seed_paper_ids))
            .all()
        )
        
        tag_counts: Dict[int, float] = {}
        # 记录每篇文献有哪些标签，供后续计算得分使用
        paper_tags_map: Dict[int, List[PaperTag]] = {}
        
        for pt in rows:
            try:
                tag_id = int(getattr(pt, "tag_id"))
                paper_id = int(getattr(pt, "paper_id"))
            except Exception:
                continue
            weight_obj = getattr(pt, "weight", None)
            w = float(weight_obj) if weight_obj is not None else 1.0
            
            # 基础计数：标签在种子文献中出现的次数 * 关联权重
            tag_counts[tag_id] = tag_counts.get(tag_id, 0.0) + w
            paper_tags_map.setdefault(paper_id, []).append(pt)

        if not tag_counts:
             # 如果种子文献没有标签，尝试回退到仅引用增强或直接返回
             pass

        # 3. 图传播 (Graph Propagation)
        propagation_debug = {}
        if use_graph_propagation and tag_counts:
            # 3.1 标签组传播：Tag -> TagGroup -> Other Tags
            # 找出涉及的标签 ID
            seed_tag_ids = list(tag_counts.keys())
            
            # 查找这些标签所属的组
            group_relations = (
                db.query(TagGroupTag)
                .filter(TagGroupTag.tag_id.in_(seed_tag_ids))
                .all()
            )
            
            involved_group_ids = set()
            for rel in group_relations:
                try:
                    involved_group_ids.add(int(getattr(rel, "group_id")))
                except Exception:
                    continue
            
            if involved_group_ids:
                # 查找这些组包含的所有标签（同组扩散）
                # 限制扩散范围，避免大组导致噪音
                group_siblings = (
                    db.query(TagGroupTag)
                    .filter(TagGroupTag.group_id.in_(list(involved_group_ids)))
                    .limit(500)
                    .all()
                )
                
                propagated_count = 0
                for rel in group_siblings:
                    try:
                        g_tag_id = int(getattr(rel, "tag_id"))
                        g_id = int(getattr(rel, "group_id"))
                    except Exception:
                        continue
                    
                    # 如果该标签不在种子标签中，给予一定的传播权重
                    # 传播权重 = 组内平均权重 * 衰减因子 (0.2)
                    if g_tag_id not in tag_counts:
                        tag_counts[g_tag_id] = 0.5  # 赋予一个基础传播分
                        propagated_count += 1
                
                propagation_debug["tag_group_expansion"] = {
                    "groups": len(involved_group_ids),
                    "new_tags": propagated_count
                }

        # 4. 归一化标签权重
        max_count = max(tag_counts.values()) if tag_counts else 0.0
        tag_boost: Dict[int, float] = {}
        if max_count > 0.0:
            tag_boost = {
                tag_id: c / max_count for tag_id, c in tag_counts.items()
            }

        # 5. 为所有候选文献（不仅仅是种子）补齐标签信息
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
            # 批量查询剩余文献的标签
            # 注意：如果 remaining_ids 很大，可能需要分批，这里假设 limit 限制了总数
            more_rows: List[PaperTag] = (
                db.query(PaperTag)
                .filter(PaperTag.paper_id.in_(remaining_ids))
                .all()
            )
            for pt in more_rows:
                try:
                    paper_id = int(getattr(pt, "paper_id"))
                except Exception:
                    continue
                paper_tags_map.setdefault(paper_id, []).append(pt)

        # 6. 计算每篇文献的最终得分
        # Score = EmbeddingScore + alpha * (TagScore + CitationScore)
        
        # 6.1 标签得分
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
            
        max_tag_score = max(paper_tag_score.values()) if paper_tag_score else 1.0
        if max_tag_score == 0: max_tag_score = 1.0

        # 6.2 引用得分 & 候选扩展 (使用 RecallEnhancementService)
        paper_citation_score: Dict[int, float] = {}
        expanded_hits: List[SemanticSearchHit] = []
        
        if use_graph_propagation:
            try:
                recall_service = RecallEnhancementService(db)
                # 获取扩展候选 (包含 outgoing 和 incoming)
                # 限制扩展数量，避免过多
                citation_candidates = recall_service.expand_candidates_using_citation_graph(
                    seed_paper_ids, limit=50
                )
                
                paper_citation_score = citation_candidates
                propagation_debug["citation_expansion_count"] = len(citation_candidates)
                
                # 检查是否有新发现的文献 (不在原始 hits 中)
                existing_ids = set(all_paper_ids)
                new_ids = [pid for pid in citation_candidates.keys() if pid not in existing_ids]
                
                if new_ids:
                    # 批量获取新文献
                    new_papers = db.query(Paper).filter(Paper.id.in_(new_ids)).all()
                    for p in new_papers:
                        # 新文献的基础相似度设为 0 (或者设为一个较小的默认值)
                        # 它的得分将完全来自图信号
                        expanded_hits.append(SemanticSearchHit(paper=p, score=0.0))
                        
                    propagation_debug["new_candidates_from_citation"] = len(new_papers)
                    
            except Exception as e:
                logger.warning(f"引用图扩展失败: {e}")

        # 7. 综合重排 (合并原始 hits 和扩展 hits)
        all_hits = hits + expanded_hits
        enhanced_hits: List[SemanticSearchHit] = []
        
        # 计算引用分的最大值用于归一化
        max_citation_score = max(paper_citation_score.values()) if paper_citation_score else 1.0
        if max_citation_score == 0: max_citation_score = 1.0

        for h in all_hits:
            pid = getattr(h.paper, "id", None)
            tag_signal = 0.0
            citation_signal = 0.0
            
            if pid is not None:
                try:
                    pid_int = int(pid)
                except Exception:
                    pid_int = None
                
                if pid_int is not None:
                    # 归一化标签分
                    if pid_int in paper_tag_score:
                        tag_signal = paper_tag_score[pid_int] / max_tag_score
                    
                    # 归一化引用分
                    if pid_int in paper_citation_score:
                        citation_signal = paper_citation_score[pid_int] / max_citation_score

            # 混合公式
            # alpha 控制标签/图信号的整体权重
            # 0.6 * tag + 0.4 * citation (稍微提高引用权重)
            graph_score = 0.6 * tag_signal + 0.4 * citation_signal
            
            # 原始分数 + alpha * 图分数
            # 注意：对于扩展出来的文献，原始分数是 0，所以它们完全靠图分数排序
            new_score = float(h.score) + alpha * float(graph_score)
            
            enhanced_hits.append(SemanticSearchHit(paper=h.paper, score=new_score))

        enhanced_hits.sort(key=lambda x: x.score, reverse=True)

        debug: Dict[str, Any] = {
            "enabled": True,
            "alpha": alpha,
            "seed_size": len(seed_paper_ids),
            "tag_count": len(tag_boost),
            "propagation": propagation_debug
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

        # 1.1) 使用图增强扩展关键词 (Dynamic Graph Expansion)
        try:
            from app.services.recall_enhancement import RecallEnhancementService
            recall_service = RecallEnhancementService(db)
            graph_expanded = recall_service.expand_keywords_using_graph(keywords)
            
            if graph_expanded:
                # 将图扩展的关键词合并到 expanded_keywords
                # 避免重复
                existing_lower = set(k.lower() for k in expanded_keywords)
                added_count = 0
                for k, score in graph_expanded.items():
                    if k.lower() not in existing_lower:
                        expanded_keywords.append(k)
                        existing_lower.add(k.lower())
                        added_count += 1
                
                if added_count > 0:
                    logger.info(f"图增强扩展了 {added_count} 个关键词: {list(graph_expanded.keys())}")
                    
        except Exception as e:
            logger.warning(f"图增强扩展失败: {e}")

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