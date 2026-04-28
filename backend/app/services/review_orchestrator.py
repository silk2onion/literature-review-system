"""
端到端综述编排服务

将: 主题 → 框架 → 批量获取文献 → 按节 RAG 召回 → 生成综述(带引用) → 参考文献列表
串联为一键流程。
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Paper, Review
from app.models.review import ReviewPaper
from app.schemas.review import (
    FrameworkSection,
    OrchestrationRequest,
    OrchestrationResult,
    ReviewFramework,
    ReviewStatus,
    SectionResult,
)
from app.services.embedding_service import EmbeddingService, get_embedding_service
from app.services.llm.openai_service import OpenAIService
from app.services.llm.prompts import (
    ORCHESTRATE_FRAMEWORK_PROMPT,
    ORCHESTRATE_SECTION_PROMPT_EN,
    ORCHESTRATE_SECTION_PROMPT_ZH,
    ORCHESTRATE_INTRO_PROMPT_ZH,
    ORCHESTRATE_INTRO_PROMPT_EN,
    GENERATE_ABSTRACT_PROMPT_ZH,
    GENERATE_ABSTRACT_PROMPT_EN,
    GENERATE_CONCLUSION_PROMPT_ZH,
    GENERATE_CONCLUSION_PROMPT_EN,
    STRUCTURED_SUMMARY_PROMPT_ZH,
    STRUCTURED_SUMMARY_PROMPT_EN,
    EVIDENCE_MATRIX_HINT_ZH,
    EVIDENCE_MATRIX_HINT_EN,
    REVIEW_TYPE_CONSTRAINTS,
    REVIEW_TYPE_CONSTRAINTS_ZH,
    get_framework_system_prompt,
    get_section_system_prompt,
)
from app.services.reference_formatter import (
    CitationStyle,
    ReferenceFormatterService,
    get_reference_formatter,
)
from app.services.semantic_search import SemanticSearchService, get_semantic_search_service

logger = logging.getLogger(__name__)


class ReviewOrchestrationService:
    """端到端综述编排服务"""

    def __init__(
        self,
        db: Session,
        llm_service: Optional[OpenAIService] = None,
        semantic_search: Optional[SemanticSearchService] = None,
        embedding_service: Optional[EmbeddingService] = None,
        ref_formatter: Optional[ReferenceFormatterService] = None,
    ):
        self.db = db
        self.llm = llm_service or OpenAIService(settings=settings)
        self.search = semantic_search or get_semantic_search_service()
        self.embedding = embedding_service or get_embedding_service()
        self.ref_formatter = ref_formatter or get_reference_formatter()

    # ------------------------------------------------------------------
    # Main orchestration
    # ------------------------------------------------------------------

    async def orchestrate(self, request: OrchestrationRequest) -> OrchestrationResult:
        """
        一键端到端编排：
        1. 生成框架
        2. 按节检索文献
        3. 确保 embedding
        4. 按节生成综述（带 Author,Year 引用）
        5. 生成参考文献列表
        6. 生成 Abstract & Conclusion
        7. 组装完整文档并落库
        """
        logger.info(f"[Orchestrate] Starting for topic='{request.topic}', keywords={request.keywords}")

        # --- Step 1: 生成综述框架 ---
        framework = await self._generate_framework(request)
        logger.info(f"[Orchestrate] Framework generated: {framework.title}, {len(framework.sections)} sections")

        # --- Step 2: 按节检索文献 (Opt-2: 去重降权, Opt-3: 必引保底) ---
        all_papers: Dict[int, Paper] = {}
        section_papers: Dict[str, List[Paper]] = {}
        assigned_paper_ids: Set[int] = set()  # Opt-2: 已被前面章节强引用的论文

        # Opt-3: 预加载必引文献
        must_cite_papers: List[Paper] = []
        if request.must_cite_paper_ids:
            must_cite_papers = self._load_papers_by_ids(request.must_cite_paper_ids)
            for p in must_cite_papers:
                all_papers[p.id] = p

        for section in framework.sections:
            papers = await self._search_papers_for_section(
                section=section,
                global_keywords=request.keywords,
                limit=request.paper_limit,
                year_from=request.year_from,
                year_to=request.year_to,
                use_local_only=request.use_local_only,
                deprioritize_ids=assigned_paper_ids,  # Opt-2
            )
            # Opt-3: 注入必引文献（去重）
            if must_cite_papers:
                existing_ids = {(p.id if isinstance(p, Paper) else p.get("id")) for p in papers}
                for mp in must_cite_papers:
                    if mp.id not in existing_ids:
                        papers.append(mp)

            section_papers[section.id] = papers
            for p in papers:
                pid = p.id if isinstance(p, Paper) else p.get("id")
                if pid:
                    all_papers[pid] = p

        logger.info(f"[Orchestrate] Total unique papers collected: {len(all_papers)}")

        # --- Step 3: 确保 embedding 存在 ---
        await self._ensure_embeddings()

        # --- Step 4: 按节生成综述正文（递归上下文传递） ---
        sections: List[SectionResult] = []
        all_cited_paper_ids: Set[int] = set()
        prev_summary = ""
        total_fw_sections = len(framework.sections)

        import re as _re
        def _is_discussion(title: str) -> bool:
            return bool(_re.search(r'讨论|总结|结论|展望|discussion|conclusion|future|summary|gap|limitation', title, _re.IGNORECASE))

        def _is_introduction(title: str) -> bool:
            return bool(_re.search(r'引言|背景|导论|introduction|background', title, _re.IGNORECASE))

        for idx, section in enumerate(framework.sections):
            papers = section_papers.get(section.id, [])
            if not papers:
                logger.warning(f"[Orchestrate] No papers for section {section.id}, skipping generation")
                sections.append(SectionResult(
                    section_id=section.id,
                    section_title=section.title,
                    text=f"*（本节暂无相关文献）*\n",
                    cited_paper_ids=[],
                ))
                continue

            # 讨论/结论章节或最后一章：Opt-6 结构化全文汇总
            is_last = (idx == total_fw_sections - 1)
            is_disc = _is_discussion(section.title)
            all_summary = None
            if (is_disc or is_last) and sections:
                all_summary = await self._build_structured_summary(sections, request.language)

            # Opt-7: 引言章节标记
            is_intro = (section.id == "1" or _is_introduction(section.title))

            result = await self._generate_section(
                section=section,
                papers=papers,
                language=request.language,
                citation_style=request.citation_style,
                previous_sections_summary=prev_summary or None,
                all_sections_summary=all_summary,
                is_introduction=is_intro,  # Opt-7
                review_type=request.review_type,  # Opt-9
                use_claims_pipeline=request.use_claims_pipeline,  # Opt-10
            )
            sections.append(result)
            all_cited_paper_ids.update(result.cited_paper_ids)

            # Opt-2: 更新已分配论文 ID
            assigned_paper_ids.update(result.cited_paper_ids)

            # Opt-8: 引用覆盖率检查
            provided_count = len(papers)
            cited_count = len(result.cited_paper_ids)
            if provided_count > 5 and cited_count / max(provided_count, 1) < 0.25:
                logger.warning(
                    f"[Orchestrate] Section '{section.title}': low citation coverage "
                    f"{cited_count}/{provided_count} ({cited_count/max(provided_count,1):.0%})"
                )

            # 累积前文摘要
            if result.text and not result.text.startswith("*"):
                prev_summary += f"【{section.title}】{result.text[:600]}...\n"

        # --- Step 5: 构建参考文献列表 ---
        cited_papers = self._load_papers_by_ids(list(all_cited_paper_ids))
        # 按第一作者姓氏 + 年份排序
        cited_papers.sort(key=lambda p: (
            self.ref_formatter._extract_first_author_surname(
                p.authors if isinstance(p, Paper) else (p.get("authors") if isinstance(p, dict) else None)
            ).lower(),
            p.year if isinstance(p, Paper) else (p.get("year") if isinstance(p, dict) else 0) or 0,
        ))

        # 解析引用格式
        try:
            style_enum = CitationStyle(request.citation_style)
        except ValueError:
            style_enum = CitationStyle.HARVARD

        references_md = self.ref_formatter.format_reference_list(cited_papers, style=style_enum)
        citation_map = self.ref_formatter.build_citation_map(cited_papers, style=style_enum)

        # --- Step 6: 生成 Abstract & Conclusion ---
        # 先组装正文部分（不含 abstract/conclusion/references）用于 LLM 输入
        body_md = self._assemble_body_only(framework, sections)

        abstract_text = await self._generate_abstract(body_md, request.language)
        conclusion_text = await self._generate_conclusion(body_md, request.language)
        logger.info(f"[Orchestrate] Abstract ({len(abstract_text)} chars) and Conclusion ({len(conclusion_text)} chars) generated")

        # --- Step 7: 组装完整 Markdown ---
        full_md = self._assemble_document(framework, sections, references_md, abstract_text, conclusion_text)

        # --- Step 8: 保存到数据库 ---
        review_id = self._save_to_db(
            framework=framework,
            full_md=full_md,
            references_md=references_md,
            cited_papers=cited_papers,
            citation_map=citation_map,
            request=request,
            abstract_text=abstract_text,
            conclusion_text=conclusion_text,
            stats={
                "total_papers_searched": len(all_papers),
                "total_papers_cited": len(cited_papers),
                "sections_count": len(sections),
            },
        )

        logger.info(f"[Orchestrate] Complete! review_id={review_id}, cited={len(cited_papers)}")

        return OrchestrationResult(
            review_id=review_id,
            title=framework.title,
            framework=framework,
            sections=sections,
            full_markdown=full_md,
            references_markdown=references_md,
            citation_map=citation_map,
            stats={
                "total_papers_searched": len(all_papers),
                "total_papers_cited": len(cited_papers),
                "sections_count": len(sections),
            },
        )

    # ------------------------------------------------------------------
    # Step 1: 生成框架
    # ------------------------------------------------------------------

    async def _generate_framework(self, request: OrchestrationRequest) -> ReviewFramework:
        lang_label = "中文" if request.language.startswith("zh") else "English"
        custom = request.custom_instructions or ""

        # Opt-9: 注入综述类型约束
        review_type = getattr(request, "review_type", "narrative") or "narrative"
        if request.language.startswith("zh"):
            type_constraint = REVIEW_TYPE_CONSTRAINTS_ZH.get(review_type, "")
        else:
            type_constraint = REVIEW_TYPE_CONSTRAINTS.get(review_type, "")
        if type_constraint:
            custom = f"【综述类型要求】\n{type_constraint}\n\n{custom}" if custom else f"【综述类型要求】\n{type_constraint}"

        if custom:
            custom = f"【用户自定义要求】\n{custom}"

        prompt = ORCHESTRATE_FRAMEWORK_PROMPT.format(
            topic=request.topic,
            keywords=", ".join(request.keywords),
            custom_instructions=custom,
            language=lang_label,
        )

        system_prompt = get_framework_system_prompt(self.db)

        result = await self.llm.complete_json(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.3,
        )

        return ReviewFramework.model_validate(result)

    # ------------------------------------------------------------------
    # Step 2: 按节检索文献
    # ------------------------------------------------------------------

    async def _search_papers_for_section(
        self,
        section: FrameworkSection,
        global_keywords: List[str],
        limit: int = 30,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        use_local_only: bool = False,
        deprioritize_ids: Optional[Set[int]] = None,
    ) -> List[Any]:
        """为单个章节检索相关文献 (Opt-1: 两轮检索, Opt-2: 去重降权)"""
        keywords = section.search_keywords or global_keywords

        papers: List[Any] = []

        # 第一轮：使用 framework 生成的关键词做语义检索
        try:
            hits, _ = await self.search.search(
                db=self.db,
                keywords=keywords,
                year_from=year_from,
                year_to=year_to,
                limit=limit,
                source=f"orchestrate_section_{section.id}",
            )
            for h in hits:
                if hasattr(h, "paper") and h.paper:
                    papers.append(h.paper)
        except Exception as e:
            logger.warning(f"[Orchestrate] Semantic search failed for section {section.id}: {e}")

        # Opt-1: 第二轮检索 — 用章节描述做语义检索，补充遗漏
        if section.description and len(papers) < limit:
            try:
                desc_keywords = [section.description[:200]]
                hits2, _ = await self.search.search(
                    db=self.db,
                    keywords=desc_keywords,
                    year_from=year_from,
                    year_to=year_to,
                    limit=limit // 2,
                    source=f"orchestrate_section_{section.id}_round2",
                )
                existing_ids = {(p.id if isinstance(p, Paper) else p.get("id")) for p in papers}
                for h in hits2:
                    if hasattr(h, "paper") and h.paper:
                        pid = h.paper.id
                        if pid not in existing_ids:
                            papers.append(h.paper)
                            existing_ids.add(pid)
            except Exception as e:
                logger.debug(f"[Orchestrate] Round-2 search failed for section {section.id}: {e}")

        # Opt-2: 对已被前面章节强引用的论文降权（排到列表末尾）
        if deprioritize_ids:
            primary = []
            deprioritized = []
            for p in papers:
                pid = p.id if isinstance(p, Paper) else p.get("id")
                if pid in deprioritize_ids:
                    deprioritized.append(p)
                else:
                    primary.append(p)
            papers = primary + deprioritized

        # 如果本地检索结果不足且允许在线搜索，尝试在线源
        if len(papers) < 5 and not use_local_only:
            try:
                from app.services.crawler import search_across_sources

                # search_across_sources returns List[Paper] (ORM objects, transient)
                online_results = search_across_sources(
                    keywords=keywords,
                    sources=["semantic_scholar"],
                    limit=limit,
                    year_from=year_from,
                    year_to=year_to,
                )

                # Save online results to database (dedup by DOI or title)
                for paper_obj in online_results:
                    existing = None
                    if paper_obj.doi:
                        existing = self.db.query(Paper).filter(
                            Paper.doi == paper_obj.doi
                        ).first()

                    if not existing and paper_obj.title:
                        existing = self.db.query(Paper).filter(
                            Paper.title == paper_obj.title
                        ).first()

                    if existing:
                        papers.append(existing)
                    else:
                        # paper_obj is a transient Paper ORM instance from the crawler
                        self.db.add(paper_obj)
                        self.db.flush()
                        papers.append(paper_obj)

                self.db.commit()
            except Exception as e:
                logger.warning(f"[Orchestrate] Online search failed for section {section.id}: {e}")

        # 去重
        seen_ids: Set[int] = set()
        unique_papers = []
        for p in papers:
            pid = p.id if isinstance(p, Paper) else p.get("id")
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                unique_papers.append(p)

        return unique_papers[:limit]

    # ------------------------------------------------------------------
    # Step 3: 确保 embedding
    # ------------------------------------------------------------------

    async def _ensure_embeddings(self):
        """为缺少 embedding 的文献补充向量"""
        try:
            count = await self.embedding.backfill_missing_embeddings(
                db=self.db, limit=200
            )
            if count > 0:
                logger.info(f"[Orchestrate] Backfilled {count} embeddings")
        except Exception as e:
            logger.warning(f"[Orchestrate] Embedding backfill failed: {e}")

    # ------------------------------------------------------------------
    # Step 4: 按节生成综述
    # ------------------------------------------------------------------

    async def _generate_section(
        self,
        section: FrameworkSection,
        papers: List[Any],
        language: str = "zh-CN",
        citation_style: str = "harvard",
        previous_sections_summary: Optional[str] = None,
        all_sections_summary: Optional[str] = None,
        is_introduction: bool = False,
        review_type: str = "narrative",
        use_claims_pipeline: bool = False,
    ) -> SectionResult:
        """为单个章节生成综述正文

        增强策略 (Opt-5/7/9/10)：
        - Opt-5: 证据矩阵提示注入
        - Opt-7: 引言章节使用专用 prompt
        - Opt-9: review_type 约束注入 system_prompt
        - Opt-10: 可选 claims-evidence-render 三阶段管线
        - 双层 RAG：chunk 优先 → paper 回退
        """
        lang_code = language[:2]

        # Lazy import:
        # Abstract / Conclusion endpoints only need to import ReviewOrchestrationService,
        # not the chunk-level citation helpers. Delaying this import avoids request-time
        # failures when unrelated endpoints pull in citation_anchoring too early.
        from app.services.citation_anchoring import (
            build_paper_context_block,
            build_chunk_context_block,
            build_chunk_ref_instruction,
            extract_ref_ids,
            resolve_ref_placeholders,
        )

        # --- 尝试 chunk-level RAG ---
        chunk_results = []
        paper_ids = []
        for p in papers:
            pid = p.id if isinstance(p, Paper) else (p.get("id") if isinstance(p, dict) else None)
            if pid:
                paper_ids.append(pid)

        if paper_ids:
            try:
                chunk_results = await self.search.search_chunks_for_section(
                    db=self.db,
                    section_title=section.title,
                    section_description=section.description or "",
                    paper_ids=paper_ids,
                    limit=15,
                    per_paper_cap=3,
                    score_threshold=0.05,
                )
            except Exception as e:
                logger.warning(f"[Orchestrate] Chunk search failed for section {section.id}: {e}")

        # --- 决定使用 chunk 上下文还是 paper 上下文 ---
        use_chunks = len(chunk_results) >= 3  # 至少3个 chunk 才值得用 chunk 模式

        if use_chunks:
            context_block = build_chunk_context_block(chunk_results, lang=lang_code)
            ref_instruction = build_chunk_ref_instruction(lang=lang_code)
            logger.info(
                f"[Orchestrate] Section '{section.title}': using chunk-level RAG "
                f"({len(chunk_results)} chunks from {len(set(c['paper_id'] for c in chunk_results))} papers)"
            )
        else:
            context_block = build_paper_context_block(papers, lang=lang_code)
            if lang_code == "zh":
                ref_instruction = (
                    "\n你必须使用提供的 [[REF_x]] 标记来引用文献，确保每个论点都有明确的文献支撑。"
                    "请写出深度、连贯、具有批判性分析的学术叙事，而不是简单的要点列表。\n"
                )
            else:
                ref_instruction = (
                    "\nYou MUST use the provided [[REF_x]] markers to cite papers, ensuring every argument "
                    "is supported by specific references. Write deep, coherent, critically analytical "
                    "academic narratives, NOT simple bullet-point summaries.\n"
                )
            if chunk_results:
                logger.info(
                    f"[Orchestrate] Section '{section.title}': only {len(chunk_results)} chunks, "
                    "falling back to paper-level RAG"
                )

        # Opt-7: 引言使用专用 prompt；Opt-5: 正文注入证据矩阵提示
        if is_introduction:
            if language.lower().startswith("en"):
                prompt_template = ORCHESTRATE_INTRO_PROMPT_EN
            else:
                prompt_template = ORCHESTRATE_INTRO_PROMPT_ZH
        else:
            if language.lower().startswith("en"):
                prompt_template = ORCHESTRATE_SECTION_PROMPT_EN
            else:
                prompt_template = ORCHESTRATE_SECTION_PROMPT_ZH

        prompt = prompt_template.format(
            section_title=section.title,
            section_description=section.description,
            papers_context=context_block,
        )

        # Opt-5: 正文章节注入证据矩阵比较维度提示（引言除外）
        if not is_introduction:
            if language.lower().startswith("en"):
                prompt += EVIDENCE_MATRIX_HINT_EN
            else:
                prompt += EVIDENCE_MATRIX_HINT_ZH

        # 注入上下文
        if previous_sections_summary:
            lang_key = language[:2]
            if lang_key == "zh":
                prompt += (
                    f"\n\n【前面章节内容摘要（请确保本章节与之衔接，避免重复论述）】\n"
                    f"{previous_sections_summary}\n"
                    f"请在本章节开头用一句过渡语自然承接前文。\n"
                )
            else:
                prompt += (
                    f"\n\n【Summary of Previous Sections (connect naturally, avoid repetition)】\n"
                    f"{previous_sections_summary}\n"
                    f"Begin with a transitional sentence linking to previous content.\n"
                )

        if all_sections_summary:
            lang_key = language[:2]
            if lang_key == "zh":
                prompt += (
                    f"\n\n【全文各章节核心发现汇总（请基于此进行综合讨论与批判性分析）】\n"
                    f"{all_sections_summary}\n"
                    f"本章节应：1) 综合比较各章节发现的共识与矛盾；2) 指出方法论局限；3) 提出研究空白和未来方向。\n"
                )
            else:
                prompt += (
                    f"\n\n【Summary of All Sections (synthesize for critical analysis)】\n"
                    f"{all_sections_summary}\n"
                    f"This section should: 1) Compare findings; 2) Identify limitations; 3) Propose future directions.\n"
                )

        # 从学科配置获取基础 system_prompt，追加引用指令
        base_section_prompt = get_section_system_prompt(self.db)
        system_prompt = f"{base_section_prompt}\n{ref_instruction}"

        # Opt-9: 注入综述类型约束到 system prompt
        if review_type and review_type != "narrative":
            lang_key = language[:2]
            if lang_key == "zh":
                type_hint = REVIEW_TYPE_CONSTRAINTS_ZH.get(review_type, "")
            else:
                type_hint = REVIEW_TYPE_CONSTRAINTS.get(review_type, "")
            if type_hint:
                system_prompt += f"\n\n【综述类型】{type_hint}"

        # Opt-10: 如果启用 claims pipeline，委托给三阶段管线
        if use_claims_pipeline:
            return await self._generate_section_via_claims(
                section=section,
                papers=papers,
                language=language,
                citation_style=citation_style,
                previous_sections_summary=previous_sections_summary,
                all_sections_summary=all_sections_summary,
            )

        try:
            raw_text = await self.llm.complete(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.4,
                max_tokens=8000,
            )
        except Exception as e:
            logger.error(f"[Orchestrate] Failed to generate section {section.id}: {e}")
            raw_text = f"*（生成失败: {e}）*"

        # 使用确定性的 [[REF_x]] / [[REF_x:pN]] 解析提取引用的文献 ID
        cited_paper_ids = extract_ref_ids(raw_text)

        # 后处理：将 [[REF_x]] / [[REF_x:pN]] 替换为真实的 (Author, Year) / (Author, Year, p.N) 引用
        resolved_text, resolved_ids, missing_ids = resolve_ref_placeholders(
            text=raw_text,
            db=self.db,
            citation_style=citation_style,
            linkable=True,
        )

        if missing_ids:
            logger.warning(
                f"[Orchestrate] Section '{section.title}': "
                f"{len(missing_ids)} citation anchors referenced non-existent papers: {missing_ids}"
            )

        return SectionResult(
            section_id=section.id,
            section_title=section.title,
            text=resolved_text,
            cited_paper_ids=resolved_ids,
        )

    # ------------------------------------------------------------------
    # Opt-6: 结构化全文汇总（替代简单截断）
    # ------------------------------------------------------------------

    async def _build_structured_summary(
        self, sections: List[SectionResult], language: str = "zh-CN"
    ) -> str:
        """用 LLM 从前面所有章节中提取结构化汇总，供讨论/结论章节使用"""
        body = "\n\n".join(
            f"【{s.section_title}】\n{s.text[:800]}"
            for s in sections if s.text and not s.text.startswith("*")
        )
        if not body:
            return ""

        if language.lower().startswith("en"):
            prompt = STRUCTURED_SUMMARY_PROMPT_EN.format(sections_content=body)
        else:
            prompt = STRUCTURED_SUMMARY_PROMPT_ZH.format(sections_content=body)

        try:
            result = await self.llm.complete_json(
                prompt=prompt,
                system_prompt="You are a senior academic researcher skilled at synthesizing research findings.",
                temperature=0.3,
            )
            # 将 JSON 结构转为可读的文本摘要
            if isinstance(result, dict):
                parts = []
                consensus = result.get("consensus", [])
                if consensus:
                    parts.append("【核心共识】\n" + "\n".join(f"- {c}" for c in consensus))
                controversies = result.get("controversies", [])
                if controversies:
                    parts.append("【主要矛盾与争议】\n" + "\n".join(f"- {c}" for c in controversies))
                limitations = result.get("methodological_limitations", [])
                if limitations:
                    parts.append("【方法论共性局限】\n" + "\n".join(f"- {l}" for l in limitations))
                gaps = result.get("research_gaps", [])
                if gaps:
                    parts.append("【研究空白】\n" + "\n".join(f"- {g}" for g in gaps))
                return "\n\n".join(parts)
            return str(result)
        except Exception as e:
            logger.warning(f"[Orchestrate] Structured summary generation failed: {e}")
            # Fallback: 简单截断
            return "\n\n".join(
                f"【{s.section_title}】{s.text[:600]}..."
                for s in sections if s.text and not s.text.startswith("*")
            )

    # ------------------------------------------------------------------
    # Opt-10: 三阶段 claims pipeline 委托
    # ------------------------------------------------------------------

    async def _generate_section_via_claims(
        self,
        section: FrameworkSection,
        papers: List[Any],
        language: str = "zh-CN",
        citation_style: str = "harvard",
        previous_sections_summary: Optional[str] = None,
        all_sections_summary: Optional[str] = None,
    ) -> SectionResult:
        """通过 claims-evidence-render 三阶段管线生成章节（Opt-10）"""
        from app.services.citation_anchoring import extract_ref_ids, resolve_ref_placeholders

        try:
            from app.services.review import SectionReviewPipelineService
            pipeline = SectionReviewPipelineService(
                db=self.db,
                llm_service=self.llm,
                semantic_search_service=self.search,
            )

            # Phase 1: 生成论点
            section_outline = f"## {section.title}\n{section.description}"
            claim_table = await pipeline.generate_section_claims(
                review_id=0,  # 新综述，无 review_id
                section_outline=section_outline,
            )

            # Phase 2: 为论点附加证据
            paper_ids = []
            for p in papers:
                pid = p.id if isinstance(p, Paper) else (p.get("id") if isinstance(p, dict) else None)
                if pid:
                    paper_ids.append(pid)

            claim_table = await pipeline.attach_evidence_for_claims(
                table=claim_table,
                top_k=5,
                paper_ids=paper_ids,
            )

            # Phase 3: 渲染章节
            rendered = await pipeline.render_section_from_claims(
                table=claim_table,
                language=language,
                previous_sections_summary=previous_sections_summary,
                all_sections_summary=all_sections_summary,
            )

            # 提取引用 ID
            cited_ids = extract_ref_ids(rendered.text)
            # resolve placeholders
            resolved_text, resolved_ids, missing_ids = resolve_ref_placeholders(
                text=rendered.text,
                db=self.db,
                citation_style=citation_style,
                linkable=True,
            )

            if missing_ids:
                logger.warning(
                    f"[Orchestrate/Claims] Section '{section.title}': "
                    f"{len(missing_ids)} missing refs: {missing_ids}"
                )

            return SectionResult(
                section_id=section.id,
                section_title=section.title,
                text=resolved_text,
                cited_paper_ids=resolved_ids,
            )
        except Exception as e:
            logger.error(f"[Orchestrate] Claims pipeline failed for section {section.id}: {e}")
            logger.info("[Orchestrate] Falling back to direct generation")
            # Fallback: 使用标准直接生成
            return await self._generate_section(
                section=section,
                papers=papers,
                language=language,
                citation_style=citation_style,
                previous_sections_summary=previous_sections_summary,
                all_sections_summary=all_sections_summary,
                is_introduction=False,
                review_type="narrative",
                use_claims_pipeline=False,  # 防止递归
            )

    # ------------------------------------------------------------------
    # Step 5 & 6: Abstract / Conclusion 生成
    # ------------------------------------------------------------------

    async def _generate_abstract(self, body_content: str, language: str = "zh-CN") -> str:
        """基于综述正文生成学术摘要"""
        # 截断过长的内容（取前 8000 字符作为上下文）
        truncated = body_content[:8000] if len(body_content) > 8000 else body_content

        if language.lower().startswith("en"):
            prompt = GENERATE_ABSTRACT_PROMPT_EN.format(review_content=truncated)
        else:
            prompt = GENERATE_ABSTRACT_PROMPT_ZH.format(review_content=truncated)

        try:
            abstract = await self.llm.complete(
                prompt=prompt,
                system_prompt="You are an expert academic writer specializing in concise, high-quality abstracts.",
                temperature=0.3,
                max_tokens=1000,
            )
            return abstract.strip()
        except Exception as e:
            logger.error(f"[Orchestrate] Abstract generation failed: {e}")
            return ""

    async def _generate_conclusion(self, body_content: str, language: str = "zh-CN") -> str:
        """基于综述正文生成结论章节"""
        # 截断过长的内容（取前 10000 字符作为上下文）
        truncated = body_content[:10000] if len(body_content) > 10000 else body_content

        if language.lower().startswith("en"):
            prompt = GENERATE_CONCLUSION_PROMPT_EN.format(review_content=truncated)
        else:
            prompt = GENERATE_CONCLUSION_PROMPT_ZH.format(review_content=truncated)

        try:
            conclusion = await self.llm.complete(
                prompt=prompt,
                system_prompt="You are an expert academic writer specializing in comprehensive, forward-looking conclusions.",
                temperature=0.4,
                max_tokens=2000,
            )
            return conclusion.strip()
        except Exception as e:
            logger.error(f"[Orchestrate] Conclusion generation failed: {e}")
            return ""

    # ------------------------------------------------------------------
    # 组装文档
    # ------------------------------------------------------------------

    def _assemble_body_only(
        self,
        framework: ReviewFramework,
        sections: List[SectionResult],
    ) -> str:
        """仅组装正文部分（不含标题/abstract/conclusion/references），用作 LLM 输入"""
        parts = []
        for section in sections:
            parts.append(f"## {section.section_title}\n")
            parts.append(section.text)
            parts.append("")
        return "\n".join(parts)

    def _assemble_document(
        self,
        framework: ReviewFramework,
        sections: List[SectionResult],
        references_md: str,
        abstract_text: str = "",
        conclusion_text: str = "",
    ) -> str:
        """组装完整的综述 Markdown 文档（委托给 document_composer）"""
        # 构造一个临时 review-like 对象供 composer 使用
        # 这里 body 部分由 sections 直接拼接
        body_parts = []
        for section in sections:
            body_parts.append(f"## {section.section_title}\n")
            body_parts.append(section.text)
            body_parts.append("")
        body_md = "\n".join(body_parts)

        from app.services.document_composer import compose_full_document

        class _TempReview:
            """临时对象，模拟 Review ORM 的字段"""
            pass

        temp = _TempReview()
        temp.title = framework.title
        temp.abstract = abstract_text or framework.abstract_description or None
        temp.content = body_md  # composer 会从 content 中 extract_body
        temp.conclusion = conclusion_text or None
        temp.references_json = None  # references_md 会在 _save_to_db 中转为 references_json

        full = compose_full_document(temp)

        # 追加 references（composer 处理 references_json，这里是原始 markdown）
        if references_md and "## References" not in full:
            full += f"\n\n---\n\n{references_md}"

        return full

    # ------------------------------------------------------------------
    # 保存到数据库
    # ------------------------------------------------------------------

    def _save_to_db(
        self,
        framework: ReviewFramework,
        full_md: str,
        references_md: str,
        cited_papers: List[Any],
        citation_map: Dict[str, Any],
        request: OrchestrationRequest,
        stats: Dict[str, Any],
        abstract_text: str = "",
        conclusion_text: str = "",
    ) -> int:
        """将综述保存到 Review 表（写入独立字段 + composer 组装 content）"""

        # 构建 references_json
        references_json_data = self._build_references_json(
            cited_papers=cited_papers,
            citation_map=citation_map,
            citation_style=request.citation_style,
        )

        review = Review(
            title=framework.title,
            keywords=request.keywords,
            framework=framework.model_dump(),
            content=full_md,
            abstract=abstract_text or framework.abstract_description or None,
            conclusion=conclusion_text or None,
            references_json=references_json_data,
            status=ReviewStatus.COMPLETED.value,
            language=request.language,
            model_config=None,
            paper_count=len(cited_papers),
            word_count=len(full_md),
            analysis_json={
                "orchestration": True,
                "citation_map": citation_map,
                "stats": stats,
                # 保留 references_markdown 以兼容旧前端读取
                "references_markdown": references_md,
            },
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        self.db.add(review)
        self.db.flush()

        # 保存 ReviewPaper 关联
        for idx, paper in enumerate(cited_papers):
            pid = paper.id if isinstance(paper, Paper) else paper.get("id")
            if pid:
                rp = ReviewPaper(
                    review_id=review.id,
                    paper_id=pid,
                    order_index=idx,
                )
                self.db.add(rp)

        # 用 composer 重组 content（确保 references_json 也被包含）
        from app.services.document_composer import compose_full_document
        review.content = compose_full_document(review)
        review.word_count = len(review.content) if review.content else 0

        self.db.commit()
        self.db.refresh(review)

        return review.id

    def _build_references_json(
        self,
        cited_papers: List[Any],
        citation_map: Dict[str, Any],
        citation_style: str = "harvard",
    ) -> Dict[str, Any]:
        """从 cited_papers + citation_map 构建 references_json 结构"""
        try:
            style_enum = CitationStyle(citation_style)
        except ValueError:
            style_enum = CitationStyle.HARVARD

        # 反转 citation_map: citation_key -> paper_info
        # citation_map 格式: {"(Author, Year)": {"paper_id": N, "title": "...", ...}}
        key_to_info = {}
        if citation_map:
            for key, info in citation_map.items():
                if isinstance(info, dict) and info.get("paper_id"):
                    key_to_info[info["paper_id"]] = {"citation_key": key, **info}

        items = []
        for idx, paper in enumerate(cited_papers):
            pid = paper.id if isinstance(paper, Paper) else (paper.get("id") if isinstance(paper, dict) else None)
            if not pid:
                continue

            # 获取格式化引用
            formatted = ""
            try:
                formatted = self.ref_formatter.format_one(paper, style=style_enum)
            except Exception as e:
                logger.warning(f"[References] format_one failed for paper {pid}: {e}")

            # 从 citation_map 获取 citation_key
            map_info = key_to_info.get(pid, {})
            citation_key = map_info.get("citation_key", "")
            if not citation_key:
                try:
                    citation_key = self.ref_formatter.make_inline_citation(paper, style=style_enum)
                except Exception:
                    citation_key = f"[{idx + 1}]"

            # 构建 raw 元数据
            if isinstance(paper, Paper):
                raw = {
                    "title": paper.title or "",
                    "authors": paper.authors if paper.authors else [],
                    "year": paper.year,
                    "journal": paper.journal or "",
                    "doi": paper.doi or "",
                }
            else:
                raw = {
                    "title": paper.get("title", ""),
                    "authors": paper.get("authors", []),
                    "year": paper.get("year"),
                    "journal": paper.get("journal", ""),
                    "doi": paper.get("doi", ""),
                }

            items.append({
                "paper_id": pid,
                "order_index": idx + 1,
                "citation_key": citation_key,
                "formatted": formatted,
                "raw": raw,
            })

        return {"style": style_enum.value, "items": items}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_papers_by_ids(self, paper_ids: List[int]) -> List[Paper]:
        """从数据库加载 Paper 对象"""
        if not paper_ids:
            return []
        return self.db.query(Paper).filter(Paper.id.in_(paper_ids)).all()

    # ------------------------------------------------------------------
    # 独立 API: 为已有综述生成 Abstract / Conclusion
    # ------------------------------------------------------------------

    @staticmethod
    async def generate_abstract_for_review(db: Session, review_id: int) -> str:
        """为已有综述独立生成 Abstract，写入独立字段并 recompose content"""
        review = db.query(Review).filter(Review.id == review_id).first()
        if not review:
            raise ValueError(f"Review {review_id} not found")

        content = review.content or ""
        if not content:
            raise ValueError("Review has no content to generate abstract from")

        language = review.language or "zh-CN"
        service = ReviewOrchestrationService(db=db)
        abstract = await service._generate_abstract(content, language)

        if abstract:
            review.abstract = abstract
            # 用 composer 重组 content
            from app.services.document_composer import compose_full_document
            review.content = compose_full_document(review)
            review.word_count = len(review.content) if review.content else 0
            review.updated_at = datetime.utcnow()
            db.commit()

        return abstract

    @staticmethod
    async def generate_conclusion_for_review(db: Session, review_id: int) -> str:
        """为已有综述独立生成 Conclusion，写入独立字段并 recompose content"""
        review = db.query(Review).filter(Review.id == review_id).first()
        if not review:
            raise ValueError(f"Review {review_id} not found")

        content = review.content or ""
        if not content:
            raise ValueError("Review has no content to generate conclusion from")

        language = review.language or "zh-CN"
        service = ReviewOrchestrationService(db=db)
        conclusion = await service._generate_conclusion(content, language)

        if conclusion:
            # 写入独立字段（Single Source of Truth）
            review.conclusion = conclusion

            # 用 composer 重组 content
            from app.services.document_composer import compose_full_document
            review.content = compose_full_document(review)
            review.word_count = len(review.content) if review.content else 0
            review.updated_at = datetime.utcnow()
            db.commit()

        return conclusion
