"""
Review 相关 API 路由
"""
import asyncio
import json
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import List, Any
import logging
import time

from sqlalchemy.orm import Session

from app.schemas.review import (
    ReviewResponse,
    ReviewPaperInfo,
    ReviewFullExport,
    ReviewGenerate,
    ReviewGenerateResponse,
    ReviewStatus,
    ReviewExport,
    OrchestrationRequest,
    OrchestrationResult,
    PipelineTaskListResponse,
    PipelineTaskResponse,
)
from app.models import Review
from app.database import SessionLocal, get_db
from app.config import settings
from app.utils.cache import review_cache
from app.services.review import generate_review as core_generate_review
from app.services.review import SectionReviewPipelineService
from app.services.llm.openai_service import OpenAIService
from app.services.semantic_search import get_semantic_search_service
from app.schemas.review import (
    GenerateSectionClaimsRequest,
    GenerateSectionClaimsResponse,
    AttachEvidenceRequest,
    AttachEvidenceResponse,
    RenderSectionFromClaimsRequest,
    RenderSectionFromClaimsResponse,
    PhdPipelineInitResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/reviews",
    tags=["reviews"],
)


# 依赖项：获取 SectionReviewPipelineService 实例
def get_section_review_pipeline_service(
    db: Session = Depends(get_db),
) -> SectionReviewPipelineService:
    """依赖注入 SectionReviewPipelineService"""
    # 使用项目推荐的单例模式获取服务实例
    llm_service = OpenAIService(settings=settings)
    semantic_search_service = get_semantic_search_service()
    return SectionReviewPipelineService(
        db=db,
        llm_service=llm_service,
        semantic_search_service=semantic_search_service,
    )


@router.post(
    "/orchestrate",
    response_model=OrchestrationResult,
    summary="一键端到端综述生成：主题 → 框架 → 文献检索 → RAG 召回 → 生成综述(带引用) → 参考文献列表",
)
async def orchestrate_review(
    payload: OrchestrationRequest,
    db: Session = Depends(get_db),
):
    """
    端到端文献综述编排：

    1. 根据主题和关键词，LLM 生成综述框架
    2. 按框架各节检索文献（本地语义检索 + 可选在线搜索）
    3. 为缺少 embedding 的文献补充向量
    4. 按节进行 RAG 召回，LLM 生成综述正文（带 Author,Year 引用标注）
    5. 自动生成 APA 格式参考文献列表
    6. 组装完整文档并保存到数据库
    """
    from app.services.review_orchestrator import ReviewOrchestrationService

    try:
        service = ReviewOrchestrationService(db=db)
        result = await service.orchestrate(payload)
        return result
    except Exception as e:
        logger.error(f"Orchestration failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"综述编排失败: {e}",
        )


@router.post(
    "/generate-framework",
    summary="Step 0: Generate a literature review framework from topic and keywords",
)
async def generate_framework(
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    Standalone framework generation (Step 0 of enhanced PhD pipeline).
    Input: { topic: str, keywords: list[str], language?: str, custom_instructions?: str }
    Output: { framework: { title, abstract_description, sections: [...] } }
    """
    from app.services.llm.prompts import ORCHESTRATE_FRAMEWORK_PROMPT
    import json as json_mod

    topic = payload.get("topic", "")
    keywords = payload.get("keywords", [])
    language = payload.get("language", "zh-CN")
    custom_instructions = payload.get("custom_instructions", "")

    if not topic:
        raise HTTPException(status_code=400, detail="topic is required")

    llm_service = OpenAIService(settings=settings)

    custom_block = ""
    if custom_instructions:
        custom_block = f"\n\n[Special Requirements]\n{custom_instructions}"

    prompt = ORCHESTRATE_FRAMEWORK_PROMPT.format(
        topic=topic,
        keywords=", ".join(keywords) if keywords else topic,
        language=language,
        custom_instructions=custom_block,
    )

    try:
        raw = await llm_service.complete(
            prompt=prompt,
            system_prompt=(
                "You are an expert academic researcher. Your task is to generate a LITERATURE REVIEW outline "
                "(not a PhD research plan or timeline). The outline should contain 3-6 sections covering: "
                "introduction, core topic literature analysis, methods/techniques review, discussion and research gaps. "
                "Each section should include search_keywords for finding relevant papers in academic databases."
            ),
            temperature=0.3,
            max_tokens=2000,
        )

        json_match = None
        if "```json" in raw:
            start = raw.index("```json") + 7
            end = raw.index("```", start)
            json_match = raw[start:end].strip()
        elif "```" in raw:
            start = raw.index("```") + 3
            end = raw.index("```", start)
            json_match = raw[start:end].strip()
        else:
            json_match = raw.strip()

        framework = json_mod.loads(json_match)
        return {"framework": framework}

    except Exception as e:
        logger.error(f"Framework generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Framework generation failed: {e}")


@router.post(
    "/phd/init",
    response_model=PhdPipelineInitResponse,
    summary="PhD Pipeline: Create review -> Generate framework -> Generate initial claims",
)
async def init_phd_pipeline(
    payload: ReviewGenerate,
    db: Session = Depends(get_db),
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    PhD Pipeline 的快速入口：
    1. 创建 Review 并生成 Framework (调用 generate_review)
    2. 使用生成的 Framework 作为 outline，生成第一批 Claims
    3. 返回 review_id 和 claims，供前端进入 Step 2
    """
    # 1. 强制设置 phd_pipeline=True, framework_only=True
    payload.phd_pipeline = True
    payload.framework_only = True
    
    # 调用核心生成逻辑
    gen_resp = await core_generate_review(db=db, payload=payload)
    if not gen_resp.success:
        raise HTTPException(status_code=500, detail=f"初始化综述失败: {gen_resp.message}")
    
    review_id = gen_resp.review_id
    framework = gen_resp.preview_markdown
    
    if not framework:
        raise HTTPException(status_code=500, detail="未能生成综述框架")

    # 2. 生成 Claims
    try:
        table = await service.generate_section_claims(
            review_id=review_id,
            section_outline=framework, # 使用整个框架作为 outline
        )
        return PhdPipelineInitResponse(
            review_id=review_id,
            claims=table.claims
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成论点失败: {e}")


@router.post(
    "/phd/generate-claims",
    response_model=GenerateSectionClaimsResponse,
    summary="【PhD Pipeline】阶段 1 (高级): 为特定章节生成论点表",
)
async def generate_claims_for_section(
    payload: GenerateSectionClaimsRequest,
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    根据指定的综述 ID 和章节大纲，调用 LLM 生成一个结构化的“论点-证据”表。
    这是 PhD 级综述管线的第一步。
    """
    try:
        table = await service.generate_section_claims(
            review_id=payload.review_id,
            section_outline=payload.section_outline,
        )
        return GenerateSectionClaimsResponse(section_claim_table=table)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成论点表失败: {e}")


@router.post(
    "/phd/attach-evidence",
    response_model=AttachEvidenceResponse,
    summary="【PhD Pipeline】阶段 2: 为论点附加 RAG 证据",
)
async def attach_evidence_to_claims(
    payload: AttachEvidenceRequest,
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    接收一个“论点-证据”表，并为其中的每一条论点执行 RAG 检索，
    将找到的文献 ID 和片段附加到表中。
    这是 PhD 级综述管线的第二步。
    """
    try:
        updated_table = await service.attach_evidence_for_claims(
            table=payload.section_claim_table,
            top_k=payload.top_k,
        )
        return AttachEvidenceResponse(section_claim_table=updated_table)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"附加证据失败: {e}")


@router.post(
    "/phd/render-section",
    response_model=RenderSectionFromClaimsResponse,
    summary="【PhD Pipeline】阶段 3: 从论点表渲染章节正文",
)
async def render_section_from_table(
    payload: RenderSectionFromClaimsRequest,
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    接收一个已附加证据的“论点-证据”表，调用 LLM 将其渲染成
    一段连贯的、带引用标记的学术段落。
    这是 PhD 级综述管线的最后一步。
    """
    try:
        rendered_section = await service.render_section_from_claims(
            table=payload.section_claim_table,
            language=payload.language,
            citation_start_index=payload.citation_start_index,
            review_id=payload.review_id,
        )
        return RenderSectionFromClaimsResponse(
            section_id=payload.section_claim_table.section_id,
            rendered_section=rendered_section,
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"渲染章节失败: {e}")




# ========== New: Step 0.5 / 3.5 / 4 ==========

@router.post(
    "/phd/auto-search",
    summary="PhD Pipeline Step 0.5: Auto-search papers for each framework section",
)
async def auto_search_for_framework(
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    After framework is confirmed, auto-search papers for each section's keywords.
    Input: {
        sections: [{ id, title, search_keywords: [...] }],
        papers_per_section: int (default 20),
        sources: list (default ["semantic_scholar"]),
        year_from?: int, year_to?: int
    }
    """
    from app.services.crawl_service import create_crawl_job, run_crawl_job_once
    from app.schemas import CrawlJobCreate

    sections = payload.get("sections", [])
    papers_per_section = int(payload.get("papers_per_section", 20))
    sources = payload.get("sources", ["semantic_scholar"])
    year_from = payload.get("year_from")
    year_to = payload.get("year_to")

    if not sections:
        raise HTTPException(status_code=400, detail="sections is required")

    results = []
    total_new = 0

    for section in sections:
        sec_id = section.get("id", "?")
        sec_title = section.get("title", "Untitled")
        keywords = section.get("search_keywords", [])

        if not keywords:
            results.append({
                "section_id": sec_id,
                "section_title": sec_title,
                "new_papers": 0,
                "message": "No search keywords for this section",
            })
            continue

        try:
            job_payload = CrawlJobCreate(
                keywords=keywords,
                sources=sources if isinstance(sources, list) else [sources],
                max_results=papers_per_section,
                page_size=min(papers_per_section, 50),
                year_from=year_from,
                year_to=year_to,
            )

            job = create_crawl_job(db=db, payload=job_payload)
            job, new_count = run_crawl_job_once(db, job.id)

            results.append({
                "section_id": sec_id,
                "section_title": sec_title,
                "job_id": job.id,
                "new_papers": new_count,
                "fetched": job.fetched_count or 0,
                "status": job.status,
            })
            total_new += new_count

        except Exception as e:
            logger.error(f"Auto-search failed for section {sec_id}: {e}", exc_info=True)
            results.append({
                "section_id": sec_id,
                "section_title": sec_title,
                "new_papers": 0,
                "error": str(e),
            })

    return {
        "total_new_papers": total_new,
        "sections_searched": len(results),
        "per_section": results,
    }


@router.post(
    "/phd/render-all",
    summary="PhD Pipeline Step 3.5: Render ALL sections from claim tables",
)
async def render_all_sections(
    payload: dict,
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    Render all sections at once from a list of claim tables.
    Input: {
        section_claim_tables: [ SectionClaimTable, ... ],
        language: str (default "zh-CN"),
        review_id?: int
    }
    """
    from app.schemas.review import SectionClaimTable

    tables_raw = payload.get("section_claim_tables", [])
    language = payload.get("language", "zh-CN")
    review_id = payload.get("review_id")

    if not tables_raw:
        raise HTTPException(status_code=400, detail="section_claim_tables is required")

    rendered_sections = []
    all_citation_map = {}

    for i, table_data in enumerate(tables_raw):
        try:
            table = SectionClaimTable.model_validate(table_data)
            rendered = await service.render_section_from_claims(
                table=table,
                language=language,
                review_id=review_id,
            )
            rendered_sections.append({
                "section_id": table.section_id,
                "section_title": table.section_title,
                "text": rendered.text,
                "citation_map": rendered.citation_map,
            })
            all_citation_map.update(rendered.citation_map or {})
        except Exception as e:
            logger.error(f"Render failed for section {i}: {e}", exc_info=True)
            rendered_sections.append({
                "section_id": table_data.get("section_id", f"section_{i}"),
                "section_title": table_data.get("section_title", f"Section {i+1}"),
                "text": f"*Rendering failed: {e}*",
                "citation_map": {},
            })

    return {
        "rendered_sections": rendered_sections,
        "total_sections": len(rendered_sections),
        "citation_map": all_citation_map,
    }


@router.post(
    "/phd/assemble",
    summary="PhD Pipeline Step 4: Assemble full document with references",
)
async def assemble_full_review(
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    Assemble all rendered sections into a complete review document with reference list.
    Input: {
        review_id?: int,
        title: str,
        rendered_sections: [{ section_id, section_title, text, citation_map }],
        citation_style: str (default "harvard")
    }
    """
    from app.services.reference_formatter import get_reference_formatter, CitationStyle
    from app.models.paper import Paper as PaperModel

    title = payload.get("title", "Literature Review")
    sections = payload.get("rendered_sections", [])
    citation_style = payload.get("citation_style", "harvard")
    review_id = payload.get("review_id")

    if not sections:
        raise HTTPException(status_code=400, detail="rendered_sections is required")

    # 1. Collect all cited paper IDs from citation maps
    all_paper_ids = set()
    for sec in sections:
        cmap = sec.get("citation_map", {})
        for v in cmap.values():
            if isinstance(v, int):
                all_paper_ids.add(v)
            elif isinstance(v, str) and v.isdigit():
                all_paper_ids.add(int(v))

    # 2. Load papers from DB
    cited_papers = []
    if all_paper_ids:
        cited_papers = db.query(PaperModel).filter(
            PaperModel.id.in_(list(all_paper_ids))
        ).all()

    # 3. Generate reference list
    ref_formatter = get_reference_formatter()
    try:
        style_enum = CitationStyle(citation_style)
    except ValueError:
        style_enum = CitationStyle.HARVARD

    cited_papers.sort(key=lambda p: (
        (p.authors[0].split()[-1].lower() if p.authors and p.authors[0] else "zzz"),
        p.year or 0,
    ))

    references_md = ref_formatter.format_reference_list(cited_papers, style=style_enum)

    # 4. Assemble full markdown
    md_lines = [f"# {title}\n"]

    for sec in sections:
        sec_title = sec.get("section_title", "Section")
        sec_text = sec.get("text", "")
        md_lines.append(f"\n## {sec_title}\n")
        md_lines.append(sec_text)

    md_lines.append(f"\n## References\n")
    md_lines.append(references_md)

    full_markdown = "\n".join(md_lines)

    # 5. Save to DB if review_id provided
    if review_id:
        from app.models import Review
        review = db.query(Review).filter(Review.id == int(review_id)).first()
        if review:
            review.content = full_markdown
            db.commit()

    return {
        "full_markdown": full_markdown,
        "references_markdown": references_md,
        "total_cited_papers": len(cited_papers),
        "total_sections": len(sections),
        "review_id": review_id,
    }




# ============================================================
# Async Task Endpoints (background pipeline with SSE progress)
# ============================================================

@router.post(
    "/phd/start-task",
    summary="Start async PhD pipeline task, returns task_id immediately",
)
async def start_pipeline_task(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Start the full PhD pipeline as an async background task.
    Returns {task_id} immediately. Use GET /phd/task/{task_id}/stream for progress.

    Input: {
        topic: str,
        keywords: list[str],
        papers_per_section: int (default 20),
        sources: list (default ["semantic_scholar"]),
        language: str (default "zh-CN"),
        citation_style: str (default "harvard")
    }
    """
    from app.services.task_runner import create_task, PipelineTaskRunner
    from app.database import SessionLocal

    topic = payload.get("topic", "")
    keywords = payload.get("keywords", [])
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]

    if not topic and not keywords:
        raise HTTPException(status_code=400, detail="topic or keywords is required")

    # Use topic as fallback for keywords
    if not keywords:
        keywords = [topic]

    task = await create_task(
        topic=topic,
        keywords=keywords,
        papers_per_section=int(payload.get("papers_per_section", 20)),
        sources=payload.get("sources", ["semantic_scholar"]),
        language=payload.get("language", "zh-CN"),
        citation_style=payload.get("citation_style", "harvard"),
    )

    async def _run_in_background():
        """Create a fresh DB session for the background task."""
        bg_db = SessionLocal()
        try:
            runner = PipelineTaskRunner(task=task, db=bg_db)
            await runner.run()
        finally:
            bg_db.close()

    background_tasks.add_task(_run_in_background)

    return {
        "task_id": task.task_id,
        "status": "started",
        "message": f"任务已启动！共 6 个步骤，请通过进度流查看实时进度。",
        "stream_url": f"/api/reviews/phd/task/{task.task_id}/stream",
    }


@router.get(
    "/phd/tasks",
    response_model=PipelineTaskListResponse,
    summary="List all PhD pipeline tasks",
)
async def list_pipeline_tasks():
    """List all active and recent background tasks in memory."""
    from app.services.task_runner import list_tasks
    tasks = list_tasks()
    return PipelineTaskListResponse(tasks=tasks)


@router.get(
    "/phd/task/{task_id}",
    response_model=PipelineTaskResponse,
    summary="Get current task status snapshot",
)
async def get_task_status(task_id: str):
    """Get a JSON snapshot of the task's current state."""
    from app.services.task_runner import get_task
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task.to_dict()


@router.get(
    "/phd/task/{task_id}/stream",
    summary="SSE stream for real-time task progress",
)
async def stream_task_progress(task_id: str):
    """
    Server-Sent Events (SSE) stream for real-time task progress.
    Events are pushed as the pipeline executes each step.
    """
    from app.services.task_runner import get_task
    from fastapi.responses import StreamingResponse

    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    async def event_generator():
        # Send current state immediately
        snapshot = json.dumps(task.to_dict(), ensure_ascii=False, default=str)
        yield f"event: snapshot\ndata: {snapshot}\n\n"

        # Stream live events from queue
        while task.status in ("pending", "running"):
            try:
                event = await asyncio.wait_for(task.event_queue.get(), timeout=30.0)
                ev_type = event.get("event", "update")
                ev_data = json.dumps(event.get("data", {}), ensure_ascii=False, default=str)
                yield f"event: {ev_type}\ndata: {ev_data}\n\n"
            except asyncio.TimeoutError:
                # Keep-alive ping
                yield "event: ping\ndata: {}\n\n"

        # Final state
        final = json.dumps(task.to_dict(), ensure_ascii=False, default=str)
        yield f"event: final\ndata: {final}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post(
    "/phd/task/{task_id}/resume",
    summary="Resume a failed pipeline task from its last checkpoint",
)
async def resume_pipeline_task(task_id: str, db: Session = Depends(get_db)):
    """
    Resume a failed or stopped pipeline task.
    Picks up from the step after the last successfully completed one.
    """
    from app.services.task_runner import resume_task

    try:
        task = await resume_task(task_id, db)
        return {
            "task_id": task.task_id,
            "status": "resuming",
            "resume_from_step": task.last_completed_step,
            "message": f"任务已从断点恢复！将从 '{task.last_completed_step}' 之后继续执行。",
            "stream_url": f"/api/reviews/phd/task/{task.task_id}/stream",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Resume task failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"恢复任务失败: {e}")


def get_db_local():
    """
    保留一个本文件内的 Session 获取器（兼容你现在的写法）。
    但后续新的导出接口会优先使用全局的 get_db 依赖。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post(
    "/{review_id}/export",
    response_model=ReviewFullExport,
    summary="导出综述（Markdown/Docx/PDF），同时返回关联文献信息",
)
def export_review(
    review_id: int,
    payload: ReviewExport,
    db: Session = Depends(get_db),
) -> ReviewFullExport:
    """
    通用导出接口（当前主要用于 Markdown 导出）：

    - 输入：ReviewExport（format, include_references）
    - 行为：
      * 读取 Review 及其关联的 Paper 列表
      * 选择导出正文 markdown：
        1) 优先使用 review.analysis_json['markdown']
        2) 否则回退到 review.content
        3) 都没有时返回 400
      * 可选返回关联文献精简信息
    - 输出：ReviewFullExport
    """
    from app.models import ReviewPaper, Paper  # 延迟导入避免循环

    logger = logging.getLogger(__name__)
    t0 = time.time()

    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # 选择 markdown 内容
    markdown = None

    analysis_json = getattr(review, "analysis_json", None)
    if isinstance(analysis_json, dict):
        markdown = analysis_json.get("markdown") or analysis_json.get("content_markdown")

    if not markdown:
        # 回退到 content
        content = getattr(review, "content", None)
        if content:
            markdown = str(content)

    if not markdown:
        # Fallback to framework if available
        framework = getattr(review, "framework", None)
        if framework:
            markdown = str(framework)

    if not markdown:
        raise HTTPException(status_code=400, detail="No markdown or content available for this review")

    # 读取关联文献
    paper_infos: List[ReviewPaperInfo] = []
    paper_count = 0

    if payload.include_references:
        rps = (
            db.query(ReviewPaper)
            .filter(ReviewPaper.review_id == review_id)
            .order_by(ReviewPaper.order_index.asc(), ReviewPaper.id.asc())
            .all()
        )
        paper_ids = [rp.paper_id for rp in rps]

        if paper_ids:
            papers = db.query(Paper).filter(Paper.id.in_(paper_ids)).all()
            for p in papers:
                authors = None
                if getattr(p, "authors", None):
                    authors = [
                        a.strip()
                        for a in str(p.authors).replace(";", ",").split(",")
                        if a.strip()
                    ]
                paper_infos.append(
                    ReviewPaperInfo(
                        id=int(getattr(p, "id")),
                        title=str(getattr(p, "title")),
                        authors=authors,
                        year=getattr(p, "year", None),
                        journal=getattr(p, "journal", None),
                        arxiv_id=getattr(p, "arxiv_id", None),
                        doi=getattr(p, "doi", None),
                        pdf_url=getattr(p, "pdf_url", None),
                        abs_url=getattr(p, "abs_url", None),
                    )
                )
            paper_count = len(paper_infos)

    elapsed = time.time() - t0
    logger.info(
        "Review export completed",
        extra={
            "review_id": review_id,
            "paper_count": paper_count,
            "format": payload.format,
            "elapsed_sec": round(elapsed, 3),
        },
    )

    return ReviewFullExport(
        review=ReviewResponse.model_validate(review),
        papers=paper_infos,
        markdown=markdown,
        analysis=analysis_json if isinstance(analysis_json, dict) else None,
    )


@router.get("/latest", response_model=ReviewResponse)
def get_latest_review():
    """
    获取最新一条综述（按 created_at 排序）
    """
    db = next(get_db_local())
    review = db.query(Review).order_by(Review.created_at.desc()).first()
    if not review:
        raise HTTPException(status_code=404, detail="No reviews found")
    return review


@router.post("/generate", response_model=ReviewGenerateResponse)
async def generate_review(payload: ReviewGenerate, db: Session = Depends(get_db)) -> ReviewGenerateResponse:
    """
    生成文献综述（前端“生成文献综述”按钮调用的接口）

    新版实现：
    - 直接调用核心服务 app.services.review.generate_review
    - 在核心服务内部：
      * 调用 LLM 生成 markdown + timeline + topics
      * 将 summary_stats 持久化到 Review.analysis_json
      * 返回包含 summary_stats 的 ReviewGenerateResponse
    - 此处只负责接入 FastAPI 依赖注入和异常处理
    """
    try:
        resp = await core_generate_review(db=db, payload=payload)
        return resp
    except Exception as e:
        # 兜底保护，避免直接抛出 500 导致前端 CORS 错误
        return ReviewGenerateResponse(
            success=False,
            review_id=0,
            status=ReviewStatus.FAILED,
            message=f"综述生成接口失败: {e}",
        )


@router.get("/{review_id}/export/full", response_model=ReviewFullExport)
def export_review_full(review_id: int, db: Session = Depends(get_db)):
    """
    第二条路：一次性导出
    1) 文献原始 JSON 信息（标题等）
    2) 对应的 markdown 综述结果
    """
    from app.models import ReviewPaper, Paper  # 延迟导入避免循环

    # 1. 拿综述
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    framework_value = getattr(review, "framework")
    if not framework_value:
        raise HTTPException(status_code=400, detail="Review framework is empty")

    # 2. 拿当前综述关联的所有 paper
    rps = (
        db.query(ReviewPaper)
        .filter(ReviewPaper.review_id == review_id)
        .order_by(ReviewPaper.order_index.asc(), ReviewPaper.id.asc())
        .all()
    )
    paper_ids = [rp.paper_id for rp in rps]

    papers = []
    if paper_ids:
        papers = (
            db.query(Paper)
            .filter(Paper.id.in_(paper_ids))
            .all()
        )

    # 3. 映射成 JSON 友好的结构
    paper_infos: List[ReviewPaperInfo] = []
    for p in papers:
        authors = None
        if getattr(p, "authors", None):
            # 支持 "A; B; C" 或 "A, B, C" 的作者串
            authors = [
                a.strip()
                for a in str(p.authors).replace(";", ",").split(",")
                if a.strip()
            ]
        paper_infos.append(
            ReviewPaperInfo(
                id=int(getattr(p, "id")),
                title=str(getattr(p, "title")),
                authors=authors,
                year=getattr(p, "year", None),
                journal=getattr(p, "journal", None),
                arxiv_id=getattr(p, "arxiv_id", None),
                doi=getattr(p, "doi", None),
                pdf_url=getattr(p, "pdf_url", None),
                abs_url=getattr(p, "abs_url", None),
            )
        )

    return ReviewFullExport(
        review=ReviewResponse.model_validate(review),
        papers=paper_infos,
        markdown=str(framework_value),
    )


@router.get("/{review_id}", response_model=ReviewResponse)
def get_review_by_id(review_id: int):
    """
    根据 ID 获取单条综述信息（包括 framework）
    方便你在没有前端页面的情况下，直接通过 /api/docs 查看 JSON 结果。
    """
    # 手动管理 session，避免依赖额外的 DI 代码
    db = next(get_db_local())
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return review

