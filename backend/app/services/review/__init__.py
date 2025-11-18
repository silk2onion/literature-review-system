
"""
综述服务模块
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Review, RecallLog
from app.models.group import LiteratureGroupPaper
from app.models.citation import PaperCitation
from app.schemas.review import (
    LitReviewLLMResult,
    ReviewGenerate,
    ReviewGenerateResponse,
    ReviewStatus,
)
from app.services.crawler import search_across_sources
from fastapi import HTTPException
from app.models import Paper
from app.schemas.review import (
    ClaimEvidence,
    RenderedSection,
    SectionClaimTable,
)
from app.services.llm.prompts import (
    GENERATE_SECTION_CLAIMS_PROMPT,
    RENDER_SECTION_FROM_CLAIMS_PROMPT_EN,
    RENDER_SECTION_FROM_CLAIMS_PROMPT_ZH,
)
from app.services.semantic_search import SemanticSearchService, get_semantic_search_service
from app.services.llm.openai_service import OpenAIService
from app.utils.cache import review_cache
from app.services.semantic_groups import get_semantic_group_service

logger = logging.getLogger(__name__)


class SectionReviewPipelineService:
    """
    章节级 PhD 综述管线服务
    - 阶段 1: 从章节提纲生成“论点–证据”表 (generate_section_claims)
    - 阶段 2: 为每条论点附加 RAG 证据 (attach_evidence_for_claims)
    - 阶段 3: 从带证据的论点表渲染章节正文 (render_section_from_claims)
    """

    def __init__(
        self,
        db: Session,
        llm_service: OpenAIService,
        semantic_search_service: SemanticSearchService,
    ):
        self.db = db
        self.llm_service = llm_service
        self.semantic_search_service = semantic_search_service

    async def generate_section_claims(
        self,
        review_id: int,
        section_outline: str,
    ) -> SectionClaimTable:
        """阶段 1: 根据章节提纲生成 SectionClaimTable"""
        review = self.db.query(Review).filter(Review.id == review_id).first()
        if not review:
            raise HTTPException(status_code=404, detail=f"Review with id {review_id} not found")

        system_prompt = "你是一位资深的城市设计领域学术研究者，擅长将章节草稿拆解为结构化的“论点–证据”表。"
        prompt = GENERATE_SECTION_CLAIMS_PROMPT.format(section_outline=section_outline)

        try:
            structured_result = await self.llm_service.complete_json(
                prompt=prompt, system_prompt=system_prompt
            )
            table = SectionClaimTable.model_validate(structured_result)
            return table
        except Exception as e:
            logger.error(f"Failed to generate section claims for review {review_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"LLM failed to generate structured claims: {e}")

    async def attach_evidence_for_claims(
        self,
        table: SectionClaimTable,
        top_k: int = 5,
    ) -> SectionClaimTable:
        """阶段 2: 为每条论点附加 RAG 证据"""
        for claim in table.claims:
            if not claim.rag_query:
                continue

            try:
                # 使用语义检索服务查找相关文献
                search_results, _ = await self.semantic_search_service.search(
                    db=self.db, keywords=[claim.rag_query], limit=top_k
                )

                paper_ids = [
                    p.paper.id
                    for p in search_results
                    if getattr(p.paper, "id", None) is not None
                ]
                claim.support_papers = paper_ids

                # 构造简单的文献片段说明
                snippets = [
                    f"[{getattr(p.paper, 'id', 'N/A')}] {p.paper.title} ({p.paper.year or 'N/A'}): {(p.paper.abstract or '')[:100]}..."
                    for p in search_results
                ]
                claim.support_snippets = snippets

                # 记录“采纳”日志：这些文献被选为论点证据
                if paper_ids:
                    try:
                        log = RecallLog(
                            event_type="accept",
                            source="review_generate_evidence",
                            query_keywords=[claim.rag_query],
                            group_keys=None,
                            paper_id=None, # 批量记录时 paper_id 可为空，详情放 extra
                            rank=None,
                            score=None,
                            extra={
                                "claim_id": claim.claim_id,
                                "claim_text": claim.text,
                                "accepted_paper_ids": paper_ids,
                                "count": len(paper_ids)
                            }
                        )
                        self.db.add(log)
                        self.db.commit()
                    except Exception:
                        logger.warning("Failed to log evidence acceptance", exc_info=True)

            except Exception as e:
                logger.error(f"Failed to attach evidence for claim {claim.claim_id} ('{claim.text}'): {e}", exc_info=True)
                # 即使失败也继续处理下一条，不中断整个流程
                claim.support_papers = []
                claim.support_snippets = []

        return table

    async def render_section_from_claims(
        self,
        table: SectionClaimTable,
        language: str = "zh-CN",
        citation_start_index: int = 1,
        review_id: Optional[int] = None,
    ) -> RenderedSection:
        """
        阶段 3: 从带证据的论点表渲染章节正文
        如果提供了 review_id，会将渲染结果保存/更新到数据库 Review.content
        """
        # 1. 收集所有不重复的 paper_id 并创建引用映射
        all_paper_ids = set()
        for claim in table.claims:
            all_paper_ids.update(claim.support_papers)

        sorted_paper_ids = sorted(list(all_paper_ids))

        paper_to_citation_num = {
            paper_id: i + citation_start_index
            for i, paper_id in enumerate(sorted_paper_ids)
        }

        citation_map = {
            i + citation_start_index: paper_id
            for i, paper_id in enumerate(sorted_paper_ids)
        }

        # 2. 构造传递给 LLM 的 payload
        claims_payload_lines = []
        for claim in table.claims:
            citation_nums = [
                paper_to_citation_num[paper_id]
                for paper_id in claim.support_papers
                if paper_id in paper_to_citation_num
            ]

            line = f"- 论点: {claim.text}"
            if citation_nums:
                line += f" (引用编号: {citation_nums})"

            claims_payload_lines.append(line)

            if claim.support_snippets:
                claims_payload_lines.append("  - 文献片段:")
                for snippet in claim.support_snippets:
                    claims_payload_lines.append(f"    - {snippet}")

        claims_payload = "\n".join(claims_payload_lines)

        # 3. 选择 prompt 并调用 LLM
        if language.lower() == "en":
            system_prompt = "You are an expert academic writer in the field of urban design, skilled at organizing structured 'claim-evidence' materials into fluent and coherent academic paragraphs."
            prompt_template = RENDER_SECTION_FROM_CLAIMS_PROMPT_EN
        else:
            system_prompt = "你是一位精通城市设计领域的学术写作者，擅长将结构化的“论点–证据”材料组织成流畅、连贯的学术段落。"
            prompt_template = RENDER_SECTION_FROM_CLAIMS_PROMPT_ZH

        prompt = prompt_template.format(claims_payload=claims_payload)

        try:
            rendered_text = await self.llm_service.complete(
                prompt=prompt, system_prompt=system_prompt
            )

            return RenderedSection(
                text=rendered_text,
                citation_map=citation_map,
            )
        except Exception as e:
            logger.error(f"Failed to render section from claims: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"LLM failed to render section text: {e}")


def enrich_papers_with_citation_context(db: Session, papers: List[Any]) -> None:
    """
    为文献列表补充引用上下文信息 (In-place modification)
    1. 内部引用关系 (Internal Citations)
    2. 全局引用计数 (Global Citation Count)
    """
    if not papers:
        return

    # 1. 提取 ID 映射
    paper_map = {}
    paper_ids = []
    for p in papers:
        pid = None
        if isinstance(p, dict):
            pid = p.get("id")
        else:
            pid = getattr(p, "id", None)
        
        if pid:
            paper_ids.append(pid)
            paper_map[pid] = p

    if not paper_ids:
        return

    # 2. 查询内部引用关系
    # 查找所有 citing_paper_id 和 cited_paper_id 都在 paper_ids 中的引用
    internal_citations = (
        db.query(PaperCitation)
        .filter(
            PaperCitation.citing_paper_id.in_(paper_ids),
            PaperCitation.cited_paper_id.in_(paper_ids)
        )
        .all()
    )

    # 构建引用图
    cited_by_map: Dict[int, List[int]] = {} # pid -> [citing_pid, ...]
    
    for cit in internal_citations:
        citing = cit.citing_paper_id
        cited = cit.cited_paper_id
        
        # Ensure we are working with int values, not Columns
        if hasattr(citing, 'value'): citing = citing.value
        if hasattr(cited, 'value'): cited = cited.value
        
        if cited not in cited_by_map: cited_by_map[cited] = []
        cited_by_map[cited].append(citing)

    # 3. 补充信息到 paper 对象/字典
    for pid, p in paper_map.items():
        context_parts = []
        
        # 全局引用数
        global_count = 0
        if isinstance(p, dict):
            global_count = p.get("citations_count", 0)
        else:
            global_count = getattr(p, "citations_count", 0)
        
        if global_count > 0:
            context_parts.append(f"Global Citations: {global_count}")

        # 内部被引 (Foundational role in this set)
        cited_by_ids = cited_by_map.get(pid, [])
        if cited_by_ids:
            # 获取引用者的标题 (截断)
            cited_by_titles = []
            for citing_id in cited_by_ids[:3]: # 最多列出3个
                citing_p = paper_map.get(citing_id)
                if citing_p:
                    t = citing_p.get("title") if isinstance(citing_p, dict) else getattr(citing_p, "title", "")
                    if t: cited_by_titles.append(f"[{t[:20]}...]")
            
            cited_msg = f"Cited by {len(cited_by_ids)} papers in this review"
            if cited_by_titles:
                cited_msg += f" ({', '.join(cited_by_titles)})"
            context_parts.append(cited_msg)

        if context_parts:
            context_str = " | ".join(context_parts)
            if isinstance(p, dict):
                p["citation_context"] = context_str
            else:
                try:
                    setattr(p, "citation_context", context_str)
                except Exception:
                    pass


async def generate_review(
    db: Session,
    payload: ReviewGenerate,
) -> ReviewGenerateResponse:
    """
    生成综述（支持两种模式）：
    1. 默认模式：一次性结构化综述（generate_lit_review）
    2. PhD 级多阶段管线：先生成框架，再生成章节级综述内容

    最终都会：
    - 保存到数据库（包括 analysis_json）
    - 返回综述 ID 和状态
    """
    # 0. 构造缓存 key，先看是否已有完成的综述可直接复用
    cache_key = review_cache.make_key(
        "review_generate_core",
        tuple(sorted(payload.keywords or [])),
        int(payload.paper_limit),
        int(payload.year_from) if payload.year_from else None,
        int(payload.year_to) if payload.year_to else None,
        payload.custom_prompt or "",
        tuple(sorted(payload.sources or [])),
        bool(getattr(payload, "framework_only", False)),
        bool(getattr(payload, "phd_pipeline", False)),
    )
    cached = review_cache.get(cache_key)
    if cached is not None:
        return cached

    llm_service = OpenAIService(settings=settings)

    # 1. 获取候选文献：优先使用指定的 paper_ids 或 group_id，否则执行搜索
    papers: List[Any] = []
    sources = payload.sources or ["arxiv"]
    
    # Check for local RAG source
    use_local_rag = "local_rag" in sources
    
    target_paper_ids = []
    if payload.paper_ids and len(payload.paper_ids) > 0:
        target_paper_ids = payload.paper_ids
    elif payload.group_id:
        # 模式 A2: 基于分组指定文献
        # 优化：直接在数据库层面进行排序和截断，优先选择年份较新的文献
        query = (
            db.query(Paper.id)
            .join(LiteratureGroupPaper, LiteratureGroupPaper.paper_id == Paper.id)
            .filter(LiteratureGroupPaper.group_id == payload.group_id)
            .order_by(Paper.year.desc().nullslast(), Paper.id.desc())
        )
        
        if payload.paper_limit:
            query = query.limit(payload.paper_limit)
            
        target_paper_ids_tuples = query.all()
        target_paper_ids = [t[0] for t in target_paper_ids_tuples]

    if target_paper_ids:
        # 模式 A: 基于本地库指定文献 (paper_ids 或 group_id)
        db_papers = db.query(Paper).filter(Paper.id.in_(target_paper_ids)).all()
        # 转换为字典格式以适配后续逻辑 (search_across_sources 返回的是 dict)
        for p in db_papers:
            papers.append({
                "title": p.title,
                "abstract": p.abstract,
                "year": p.year,
                "authors": p.authors,
                "journal": p.journal,
                "url": p.pdf_url or p.abs_url,
                "source": "local_library",
                "id": p.id  # 保留 ID 以便后续关联
            })
        logger.info(f"Using {len(papers)} local papers for review generation (Source: {'paper_ids' if payload.paper_ids else 'group_id'})")
    elif use_local_rag:
        # 模式 C: 本地 RAG 检索 (Tag Enhanced)
        logger.info("Using Local RAG (Tag Enhanced) for review generation...")
        semantic_service = get_semantic_search_service()
        # Use async search
        hits, debug_info = await semantic_service.search(
            db=db,
            keywords=payload.keywords,
            year_from=payload.year_from,
            year_to=payload.year_to,
            limit=payload.paper_limit,
            source="review_generation_rag"
        )
        
        for hit in hits:
            p = hit.paper
            papers.append({
                "title": p.title,
                "abstract": p.abstract,
                "year": p.year,
                "authors": p.authors,
                "journal": p.journal,
                "url": p.pdf_url or p.abs_url,
                "source": "local_rag",
                "id": p.id,
                "score": hit.score
            })
        logger.info(f"Local RAG found {len(papers)} papers. Debug: {debug_info}")
        
        # 如果本地 RAG 结果不足且还有其他在线源，尝试补充（可选优化）
        # 目前简单处理：如果指定了 local_rag，主要依赖它。
        # 若需要混合，可在此处继续调用 search_across_sources 并 extend papers
        
    else:
        # 模式 B: 执行在线搜索
        papers = search_across_sources(
            keywords=payload.keywords,
            sources=sources,
            limit=payload.paper_limit,
            year_from=payload.year_from,
            year_to=payload.year_to,
        )

    # 1.05 补充引用上下文信息
    try:
        enrich_papers_with_citation_context(db, papers)
    except Exception as e:
        logger.warning(f"Failed to enrich papers with citation context: {e}")

    # 1.1 记录召回相关日志（综述生成使用的候选文献）
    try:
        papers_summary = []
        for idx, p in enumerate(papers[:50]):
            if isinstance(p, dict):
                papers_summary.append(
                    {
                        "idx": idx,
                        "title": p.get("title"),
                        "year": p.get("year"),
                        "source": p.get("source"),
                        "doi": p.get("doi"),
                        "arxiv_id": p.get("arxiv_id"),
                    }
                )
            else:
                papers_summary.append(
                    {
                        "idx": idx,
                        "repr": repr(p),
                    }
                )

        recall_log = RecallLog(
            event_type="query",
            source="review_generate",
            query_keywords=payload.keywords,
            group_keys=None,
            paper_id=None,
            rank=None,
            score=None,
            extra={
                "sources": sources,
                "paper_limit": payload.paper_limit,
                "year_from": payload.year_from,
                "year_to": payload.year_to,
                "papers_summary": papers_summary,
                "mode": "local_library" if (payload.paper_ids or payload.group_id) else "online_search",
                "group_id": payload.group_id
            },
        )
        db.add(recall_log)
        db.commit()
    except Exception:
        logger.exception("记录综述生成召回日志失败", exc_info=True)

    try:
        model_name = getattr(llm_service, "model_name", None)

        # 注入语义组信息到 Prompt
        # 检测关键词激活的语义组
        semantic_service = get_semantic_group_service()
        expanded_result = semantic_service.expand_keywords(payload.keywords)
        activated_groups: Dict[str, Any] = expanded_result.get("activated_groups", {})  # type: ignore
        
        semantic_context = ""
        if activated_groups:
            # activated_groups.values() 返回的是 SemanticGroup 对象
            group_names = [g.name for g in activated_groups.values()]
            semantic_context = f"\n\n【检测到的相关语义领域】: {', '.join(group_names)}\n请在综述中重点关注这些领域的视角。"
            logger.info(f"Review generation activated groups: {group_names}")

        # 如果有自定义 prompt，追加语义上下文；如果没有，则作为基础 prompt 的一部分（需修改 LLM service 接口支持，或追加到 custom_prompt）
        # 这里简单策略：追加到 custom_prompt (如果 payload.custom_prompt 为空则初始化)
        original_custom_prompt = payload.custom_prompt or ""
        if semantic_context:
            payload.custom_prompt = f"{original_custom_prompt}{semantic_context}"

        # 根据请求选择生成模式
        framework_md: Optional[str] = None
        content_md: Optional[str] = None
        summary_stats: Dict[str, Any] = {}

        if getattr(payload, "phd_pipeline", False):
            # PhD 级多阶段管线：先生成框架，再写章节级综述
            if not papers:
                return ReviewGenerateResponse(
                    success=False,
                    review_id=0,
                    status=ReviewStatus.FAILED,
                    message="未找到相关文献，无法生成综述框架。请尝试放宽搜索条件或手动选择文献。",
                )

            framework_md = await llm_service.generate_review_framework(
                keywords=payload.keywords,
                papers=papers,
            )

            # 如果只需要框架，则直接保存框架并返回
            if payload.framework_only:
                pipeline_stats: Dict[str, Any] = {
                    "pipeline": {
                        "mode": "phd_pipeline",
                        "only_framework": True,
                    }
                }

                review = Review(
                    title=" / ".join(payload.keywords),
                    keywords=payload.keywords,
                    framework=framework_md,
                    content=None,
                    abstract=None,
                    status=ReviewStatus.COMPLETED.value
                    if isinstance(ReviewStatus.COMPLETED.value, str)
                    else "completed",
                    language="zh-CN",
                    model_config={"model": model_name} if model_name else None,
                    paper_count=len(papers),
                    word_count=len(framework_md or ""),
                    analysis_json=pipeline_stats,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                )
                db.add(review)
                db.commit()
                db.refresh(review)

                resp = ReviewGenerateResponse(
                    success=True,
                    review_id=int(getattr(review, "id")),
                    status=ReviewStatus.COMPLETED,
                    message="PhD 级多阶段综述框架生成成功",
                    preview_markdown=framework_md,
                    used_prompt=None,
                    summary_stats=pipeline_stats,
                )

                review_cache.set(cache_key, resp)
                return resp

            # 完整多阶段：在框架基础上生成详细内容
            content_md = await llm_service.generate_review_content(
                framework=framework_md,
                papers=papers,
            )

            summary_stats = {
                "pipeline": {
                    "mode": "phd_pipeline",
                    "steps": [
                        {
                            "name": "framework",
                            "description": "基于候选文献生成综述框架",
                        },
                        {
                            "name": "content",
                            "description": "基于框架撰写章节级综述与总结",
                        },
                    ],
                }
            }

        else:
            # 默认：一步式结构化综述（带 timeline / topics）
            llm_result: LitReviewLLMResult = await llm_service.generate_lit_review(
                keywords=payload.keywords,
                papers=papers,
                custom_prompt=payload.custom_prompt,
                year_from=payload.year_from,
                year_to=payload.year_to,
            )

            framework_md = None
            content_md = llm_result.markdown

            # 组装结构化分析数据，便于前端直接用于时间轴 / 主题统计
            summary_stats = {
                "timeline": [t.model_dump() for t in llm_result.timeline],
                "topics": [t.model_dump() for t in llm_result.topics],
            }

        review = Review(
            title=" / ".join(payload.keywords),
            # 注意：Review.keywords 列类型在模型中是 JSON / Text，具体以模型为准
            keywords=payload.keywords,  # 若模型为 Text，可在模型层统一转成字符串
            framework=framework_md,
            content=content_md,
            abstract=None,
            status=ReviewStatus.COMPLETED.value
            if isinstance(ReviewStatus.COMPLETED.value, str)
            else "completed",
            language="zh-CN",
            model_config={"model": model_name} if model_name else None,
            paper_count=len(papers),
            word_count=len(content_md or ""),
            analysis_json=summary_stats,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        db.add(review)
        db.commit()
        db.refresh(review)

        resp = ReviewGenerateResponse(
            success=True,
            review_id=int(getattr(review, "id")),
            status=ReviewStatus.COMPLETED,
            message="综述生成成功",
            preview_markdown=content_md,
            used_prompt=None,  # 若后续有 PromptConfig，再填充
            summary_stats=summary_stats,
        )

        # 1.2 记录“采纳”日志（默认模式下，所有输入文献均视为被采纳用于生成综述）
        try:
            # 提取 paper IDs
            accepted_paper_ids = []
            for p in papers:
                pid = None
                if isinstance(p, dict):
                    pid = p.get("id")
                else:
                    pid = getattr(p, "id", None)
                
                if pid is not None:
                    accepted_paper_ids.append(pid)
            
            if accepted_paper_ids:
                accept_log = RecallLog(
                    event_type="accept",
                    source="review_generate_default",
                    query_keywords=payload.keywords,
                    group_keys=None,
                    paper_id=None,
                    rank=None,
                    score=None,
                    extra={
                        "review_id": int(getattr(review, "id")),
                        "accepted_paper_ids": accepted_paper_ids,
                        "count": len(accepted_paper_ids)
                    },
                )
                db.add(accept_log)
                db.commit()
        except Exception:
            logger.warning("Failed to log review acceptance", exc_info=True)

        review_cache.set(cache_key, resp)
        return resp
    except Exception as e:
        logger.error(f"Failed to generate review: {e}", exc_info=True)
        return ReviewGenerateResponse(
            success=False,
            review_id=0,
            status=ReviewStatus.FAILED,
            message=f"综述生成失败: {e}",
        )