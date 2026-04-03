"""
AI 文献筛选服务。

三层筛选架构：
1. 关键词预过滤（零成本）—— 标题/摘要中完全不含任何领域关键词的直接 reject
2. 批量 LLM 打分（5-10 篇/次打包）—— 大幅降低 API 调用次数
3. 三档决策：promote / pending_review / reject
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional, Callable, Awaitable

from sqlalchemy.orm import Session

from app.models.staging_paper import StagingPaper
from app.services.llm.openai_service import OpenAIService
from app.config import settings

logger = logging.getLogger(__name__)


# ── 结果数据结构 ──────────────────────────────────────────────

@dataclass
class ScoringResult:
    """单篇论文的打分结果"""
    staging_paper_id: int
    score: int
    reason: str
    decision: str  # "promote" | "pending_review" | "reject" | "pre_filtered"


@dataclass
class BatchScreeningResult:
    """批量筛选汇总"""
    total: int = 0
    scored: int = 0
    promoted: int = 0
    pending_review: int = 0
    rejected: int = 0
    pre_filtered: int = 0
    failed: int = 0
    details: List[ScoringResult] = field(default_factory=list)


# ── 配置 ─────────────────────────────────────────────────────

PROMOTE_THRESHOLD = 7     # >= 7 自动推荐入库
REVIEW_THRESHOLD = 4      # 4-6 待人工复核
BATCH_SIZE = 8            # 每次打包几篇发给 LLM
CONCURRENCY = 3           # 并发批次数
MAX_ABSTRACT_LEN = 500    # 发给 LLM 的摘要截断长度（控制 token）


# ── 第一层：关键词预过滤 ─────────────────────────────────────

def extract_topic_keywords(topic: str) -> List[str]:
    """
    从研究主题中提取关键词用于预过滤。
    简单策略：按空格/标点分词，取 >= 3 字符的词，去掉常见停用词。
    """
    STOP_WORDS = {
        "the", "and", "for", "with", "from", "that", "this", "are", "was",
        "were", "been", "have", "has", "had", "not", "but", "can", "will",
        "its", "their", "they", "which", "what", "how", "into", "about",
        "between", "through", "during", "before", "after", "above", "below",
        "based", "using", "study", "research", "analysis", "review",
        "approach", "method", "impact", "effect", "role", "case",
    }
    words = re.findall(r'[a-zA-Z\u4e00-\u9fff]{2,}', topic.lower())
    keywords = [w for w in words if w not in STOP_WORDS and len(w) >= 3]
    # 去重保序
    seen = set()
    unique = []
    for k in keywords:
        if k not in seen:
            seen.add(k)
            unique.append(k)
    return unique


def pre_filter_paper(sp: StagingPaper, topic_keywords: List[str], min_match: int = 1) -> bool:
    """
    预过滤：标题+摘要中是否至少包含 min_match 个主题关键词。
    返回 True = 通过（需要 LLM 打分），False = 直接拒绝。
    """
    if not topic_keywords:
        return True  # 没提取到关键词则不过滤

    text = f"{sp.title or ''} {sp.abstract or ''}".lower()

    match_count = sum(1 for kw in topic_keywords if kw in text)
    return match_count >= min_match


# ── 第二层：批量 LLM 打分 ────────────────────────────────────

BATCH_SCORING_PROMPT = """You are a senior academic reviewer. Evaluate the relevance of each paper to the given research topic.

【Research Topic】
{topic}

【Papers to Evaluate】
{papers_block}

【Scoring Criteria】
- 10: Perfect match, core literature for this specific topic.
- 7-9: Highly relevant, provides important context or evidence.
- 4-6: Tangentially relevant or too broad/general.
- 0-3: Irrelevant, different discipline, or purely coincidental keyword match.

Return ONLY a JSON object with a "results" array, one entry per paper, in the same order:
{{
  "results": [
    {{"id": <paper_id>, "score": <int 0-10>, "reason": "<one sentence in Chinese>"}},
    ...
  ]
}}"""


def _build_papers_block(papers: List[StagingPaper]) -> str:
    """将一批论文格式化为 prompt 中的文本块。"""
    lines = []
    for sp in papers:
        abstract = (sp.abstract or "No abstract available.")[:MAX_ABSTRACT_LEN]
        lines.append(f"[Paper ID={sp.id}]\nTitle: {sp.title}\nAbstract: {abstract}\n")
    return "\n".join(lines)


async def score_batch(
    llm: OpenAIService,
    topic: str,
    papers: List[StagingPaper],
) -> List[ScoringResult]:
    """对一批论文（最多 BATCH_SIZE 篇）打包调用 LLM 打分。"""
    prompt = BATCH_SCORING_PROMPT.format(
        topic=topic,
        papers_block=_build_papers_block(papers),
    )
    raw = await llm.complete_json(
        prompt=prompt,
        system_prompt="You are a professional academic reviewer. Always respond with valid JSON.",
        temperature=0.1,
        max_tokens=256 * len(papers),  # 每篇约需 50 tokens，留足余量
    )

    # complete_json 返回 dict，但批量 prompt 要求返回 array
    # 有些 LLM 会包在 {"results": [...]} 里
    if isinstance(raw, dict):
        items = raw.get("results", raw.get("papers", raw.get("scores", [])))
        if isinstance(items, list):
            raw = items
        else:
            # fallback: 尝试取 dict values 里的 list
            for v in raw.values():
                if isinstance(v, list):
                    raw = v
                    break

    if not isinstance(raw, list):
        logger.warning(f"Batch scoring returned unexpected type: {type(raw)}, trying to parse...")
        raw = []

    # 将 LLM 返回映射回论文
    paper_map = {sp.id: sp for sp in papers}
    results: List[ScoringResult] = []

    for item in raw:
        if not isinstance(item, dict):
            continue
        pid = item.get("id", 0)
        score = int(item.get("score", 0))
        reason = str(item.get("reason", ""))

        if pid not in paper_map:
            continue

        if score >= PROMOTE_THRESHOLD:
            decision = "promote"
        elif score >= REVIEW_THRESHOLD:
            decision = "pending_review"
        else:
            decision = "reject"

        results.append(ScoringResult(
            staging_paper_id=pid,
            score=score,
            reason=reason,
            decision=decision,
        ))

    return results


# ── 主流程 ───────────────────────────────────────────────────

async def screen_staging_papers(
    db: Session,
    topic: str,
    paper_ids: Optional[List[int]] = None,
    crawl_job_ids: Optional[List[int]] = None,
    keyword_filter: Optional[str] = None,
    auto_apply: bool = True,
    on_progress: Optional[Callable[[int, int, int], Awaitable[None]]] = None,
) -> BatchScreeningResult:
    """
    批量 AI 筛选暂存文献。

    三层架构：
    1. 关键词预过滤 → 零成本排除明显不相关
    2. 补齐缺失 abstract
    3. 批量 LLM 打分（BATCH_SIZE 篇/次）
    """
    from sqlalchemy import or_

    llm = OpenAIService(settings=settings)
    # 使用筛选专用轻量模型，为空则 fallback 到主模型
    screening_model = (getattr(settings, "SCREENING_MODEL", "") or "").strip()
    _original_model = settings.OPENAI_MODEL
    if screening_model:
        logger.info(f"Using screening model: {screening_model} (instead of {llm.model})")
        settings.OPENAI_MODEL = screening_model

    # 构建查询
    query = db.query(StagingPaper).filter(StagingPaper.status == "pending")
    if paper_ids:
        query = query.filter(StagingPaper.id.in_(paper_ids))
    elif crawl_job_ids:
        query = query.filter(StagingPaper.crawl_job_id.in_(crawl_job_ids))

    if keyword_filter and keyword_filter.strip():
        like = f"%{keyword_filter.strip()}%"
        query = query.filter(
            or_(StagingPaper.title.ilike(like), StagingPaper.abstract.ilike(like))
        )

    all_papers = query.order_by(StagingPaper.created_at.desc()).all()

    summary = BatchScreeningResult(total=len(all_papers))
    if not all_papers:
        return summary

    # ── 第一层：关键词预过滤 ──
    topic_keywords = extract_topic_keywords(topic)
    logger.info(f"Topic keywords for pre-filter: {topic_keywords}")

    papers_to_score: List[StagingPaper] = []
    for sp in all_papers:
        if pre_filter_paper(sp, topic_keywords, min_match=1):
            papers_to_score.append(sp)
        else:
            # 直接拒绝
            summary.pre_filtered += 1
            result = ScoringResult(
                staging_paper_id=sp.id,
                score=0,
                reason=f"预过滤：标题/摘要中未包含任何主题关键词 ({', '.join(topic_keywords[:5])}...)",
                decision="pre_filtered",
            )
            summary.details.append(result)

            if auto_apply:
                sp.llm_score = 0
                sp.llm_tags = ["pre_filtered:0", result.reason[:80]]
                sp.status = "rejected"
                sp.exclusion_reason = result.reason
                db.commit()

    logger.info(f"Pre-filter: {summary.pre_filtered} rejected, {len(papers_to_score)} to score with LLM")

    if not papers_to_score:
        return summary

    # ── 补齐缺 abstract ──
    missing_abs = [sp for sp in papers_to_score if not (sp.abstract or "").strip() and (sp.doi or "").strip()]
    if missing_abs:
        logger.info(f"Auto-enriching {len(missing_abs)} papers missing abstracts...")
        from app.services.enrichment_service import _enrich_one_paper
        for sp in missing_abs:
            try:
                await asyncio.to_thread(_enrich_one_paper, sp)
                db.commit()
            except Exception as e:
                logger.warning(f"Auto-enrich failed for paper {sp.id}: {e}")

    # ── 第二层：批量 LLM 打分 ──
    paper_map = {sp.id: sp for sp in papers_to_score}

    # 分批
    batches = [
        papers_to_score[i:i + BATCH_SIZE]
        for i in range(0, len(papers_to_score), BATCH_SIZE)
    ]

    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def _score_batch_with_limit(batch: List[StagingPaper]) -> List[ScoringResult]:
        async with semaphore:
            try:
                return await score_batch(llm, topic, batch)
            except Exception as e:
                logger.warning(f"Batch scoring failed: {e}")
                return []

    # 并发执行各批次
    tasks = [_score_batch_with_limit(batch) for batch in batches]

    scored_ids = set()

    for coro in asyncio.as_completed(tasks):
        batch_results = await coro

        for result in batch_results:
            scored_ids.add(result.staging_paper_id)
            summary.scored += 1
            summary.details.append(result)

            if auto_apply:
                sp = paper_map.get(result.staging_paper_id)
                if not sp:
                    continue
                sp.llm_score = result.score
                sp.llm_tags = [
                    f"{result.decision}:{result.score}",
                    result.reason[:80],
                ]

                if result.decision == "promote":
                    if (sp.screening_stage or "identification") == "identification":
                        sp.screening_stage = "screening"
                    summary.promoted += 1
                elif result.decision == "pending_review":
                    if (sp.screening_stage or "identification") == "identification":
                        sp.screening_stage = "screening"
                    summary.pending_review += 1
                else:
                    sp.status = "rejected"
                    sp.exclusion_reason = f"AI 评分 {result.score}/10: {result.reason}"
                    summary.rejected += 1

                db.commit()

        if on_progress:
            await on_progress(summary.scored + summary.pre_filtered, summary.total, summary.promoted)

    # 批量返回里可能漏掉某些论文（LLM 没返回对应 id），标记为 failed
    for sp in papers_to_score:
        if sp.id not in scored_ids:
            summary.failed += 1

    # 恢复原始模型
    settings.OPENAI_MODEL = _original_model

    return summary
