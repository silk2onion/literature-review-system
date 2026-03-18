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
from app.services.citation_anchoring import (
    build_paper_context_block,
    extract_ref_ids,
    generate_reference_list,
    resolve_ref_placeholders,
)
from app.services.embedding_service import EmbeddingService, get_embedding_service
from app.services.llm.openai_service import OpenAIService
from app.services.llm.prompts import (
    ORCHESTRATE_FRAMEWORK_PROMPT,
    ORCHESTRATE_SECTION_PROMPT_EN,
    ORCHESTRATE_SECTION_PROMPT_ZH,
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
        6. 组装完整文档并落库
        """
        logger.info(f"[Orchestrate] Starting for topic='{request.topic}', keywords={request.keywords}")

        # --- Step 1: 生成综述框架 ---
        framework = await self._generate_framework(request)
        logger.info(f"[Orchestrate] Framework generated: {framework.title}, {len(framework.sections)} sections")

        # --- Step 2: 按节检索文献 ---
        all_papers: Dict[int, Paper] = {}
        section_papers: Dict[str, List[Paper]] = {}

        for section in framework.sections:
            papers = await self._search_papers_for_section(
                section=section,
                global_keywords=request.keywords,
                limit=request.paper_limit,
                year_from=request.year_from,
                year_to=request.year_to,
                use_local_only=request.use_local_only,
            )
            section_papers[section.id] = papers
            for p in papers:
                pid = p.id if isinstance(p, Paper) else p.get("id")
                if pid:
                    all_papers[pid] = p

        logger.info(f"[Orchestrate] Total unique papers collected: {len(all_papers)}")

        # --- Step 3: 确保 embedding 存在 ---
        await self._ensure_embeddings()

        # --- Step 4: 按节生成综述正文 ---
        sections: List[SectionResult] = []
        all_cited_paper_ids: Set[int] = set()

        for section in framework.sections:
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

            result = await self._generate_section(
                section=section,
                papers=papers,
                language=request.language,
                citation_style=request.citation_style,
            )
            sections.append(result)
            all_cited_paper_ids.update(result.cited_paper_ids)

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

        # --- Step 6: 组装完整 Markdown ---
        full_md = self._assemble_document(framework, sections, references_md)

        # --- Step 7: 保存到数据库 ---
        review_id = self._save_to_db(
            framework=framework,
            full_md=full_md,
            references_md=references_md,
            cited_papers=cited_papers,
            citation_map=citation_map,
            request=request,
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
        if custom:
            custom = f"【用户自定义要求】\n{custom}"

        prompt = ORCHESTRATE_FRAMEWORK_PROMPT.format(
            topic=request.topic,
            keywords=", ".join(request.keywords),
            custom_instructions=custom,
            language=lang_label,
        )

        system_prompt = "你是一位资深的学术研究者，擅长规划文献综述框架。请严格按 JSON 格式输出。"

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
    ) -> List[Any]:
        """为单个章节检索相关文献"""
        keywords = section.search_keywords or global_keywords

        papers: List[Any] = []

        # 优先使用本地语义检索
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
    ) -> SectionResult:
        """为单个章节生成综述正文（使用 [[REF_x]] 锚定引用系统）"""

        # 使用 citation_anchoring 模块构建 [[REF_x]] 格式的文献上下文
        papers_context = build_paper_context_block(papers, lang=language[:2])

        # 选择 prompt
        if language.lower().startswith("en"):
            prompt_template = ORCHESTRATE_SECTION_PROMPT_EN
        else:
            prompt_template = ORCHESTRATE_SECTION_PROMPT_ZH

        prompt = prompt_template.format(
            section_title=section.title,
            section_description=section.description,
            papers_context=papers_context,
        )

        system_prompt = (
            "你是一位精通学术写作的研究者，擅长撰写高质量的学术综述。"
            "你必须使用提供的 [[REF_x]] 标记来引用文献，确保每个论点都有明确的文献支撑。"
            "请写出深度、连贯、具有批判性分析的学术叙事，而不是简单的要点列表。"
            if language.startswith("zh") else
            "You are an expert academic researcher skilled at writing high-quality literature reviews. "
            "You MUST use the provided [[REF_x]] markers to cite papers, ensuring every argument "
            "is supported by specific references. Write deep, coherent, critically analytical "
            "academic narratives, NOT simple bullet-point summaries."
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

        # 使用确定性的 [[REF_x]] 解析提取引用的文献 ID
        cited_paper_ids = extract_ref_ids(raw_text)

        # 后处理：将 [[REF_x]] 替换为真实的 (Author, Year) 引用
        resolved_text, resolved_ids, missing_ids = resolve_ref_placeholders(
            text=raw_text,
            db=self.db,
            citation_style=citation_style,
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
    # Step 5 & 6: 组装文档
    # ------------------------------------------------------------------

    def _assemble_document(
        self,
        framework: ReviewFramework,
        sections: List[SectionResult],
        references_md: str,
    ) -> str:
        """组装完整的综述 Markdown 文档"""
        parts = [f"# {framework.title}\n"]

        if framework.abstract_description:
            parts.append(f"> {framework.abstract_description}\n")

        for section in sections:
            parts.append(f"## {section.section_title}\n")
            parts.append(section.text)
            parts.append("")  # blank line

        if references_md:
            parts.append("\n---\n")
            parts.append(references_md)

        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Step 7: 保存到数据库
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
    ) -> int:
        """将综述保存到 Review 表"""
        review = Review(
            title=framework.title,
            keywords=request.keywords,
            framework=framework.model_dump(),
            content=full_md,
            abstract=framework.abstract_description or None,
            status=ReviewStatus.COMPLETED.value,
            language=request.language,
            model_config=None,
            paper_count=len(cited_papers),
            word_count=len(full_md),
            analysis_json={
                "orchestration": True,
                "citation_map": citation_map,
                "stats": stats,
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

        self.db.commit()
        self.db.refresh(review)

        return review.id

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_papers_by_ids(self, paper_ids: List[int]) -> List[Paper]:
        """从数据库加载 Paper 对象"""
        if not paper_ids:
            return []
        return self.db.query(Paper).filter(Paper.id.in_(paper_ids)).all()
