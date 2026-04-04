"""
Review 相关 API 路由
"""
import asyncio
import json
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import List
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
    ReviewSectionsUpdate,
)
from app.models import Review
from app.database import SessionLocal, get_db
from app.config import settings
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


@router.get(
    "/",
    response_model=List[ReviewResponse],
    summary="获取所有综述列表",
)
def list_reviews(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    返回所有已生成的综述列表，按创建时间倒序排列。
    """
    reviews = (
        db.query(Review)
        .order_by(Review.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return reviews


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

        # 从 LLM 输出中提取 JSON（健壮解析，兼容各种格式）
        import re as _re
        json_text = raw.strip()

        # 尝试提取 ```json ... ``` 或 ``` ... ``` 代码块
        code_block = _re.search(r"```(?:json)?\s*\n?(.*?)```", raw, _re.DOTALL)
        if code_block:
            json_text = code_block.group(1).strip()
        else:
            # 尝试找第一个 { 到最后一个 } 之间的内容
            first_brace = raw.find("{")
            last_brace = raw.rfind("}")
            if first_brace != -1 and last_brace > first_brace:
                json_text = raw[first_brace : last_brace + 1]

        framework = json_mod.loads(json_text)
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
            previous_sections_summary=payload.previous_sections_summary,
            all_sections_summary=payload.all_sections_summary,
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
                page_size=min(papers_per_section, 200),
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
    "/phd/task/{task_id}/cancel",
    summary="Cancel a running pipeline task",
)
async def cancel_pipeline_task(task_id: str):
    """
    Cancel an async pipeline task.
    This marks task status as cancelled and persists cancellation to DB.
    """
    from app.services.task_runner import cancel_task

    try:
        task = cancel_task(task_id)
        return {
            "task_id": task.task_id,
            "status": task.status,
            "message": "任务已取消",
            "stream_url": f"/api/reviews/phd/task/{task.task_id}/stream",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Cancel task failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"取消任务失败: {e}")


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
def get_latest_review(db: Session = Depends(get_db)):
    """
    获取最新一条综述（按 created_at 排序）
    """
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


@router.get(
    "/{review_id}/export/docx",
    summary="导出综述为 DOCX (Word) 格式",
)
def export_review_docx(
    review_id: int,
    db: Session = Depends(get_db),
):
    """
    将综述导出为 Microsoft Word (.docx) 格式。
    返回二进制文件流，可直接下载。
    """
    from app.services.export_service import export_review_to_docx
    from fastapi.responses import Response

    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    content = review.content
    if not content:
        raise HTTPException(status_code=400, detail="Review has no content to export")

    title = review.title or "Literature Review"

    try:
        docx_bytes = export_review_to_docx(content, title)
    except Exception as e:
        logger.error(f"DOCX export failed for review {review_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"DOCX 导出失败: {e}")

    # Sanitize filename — 中文需要 RFC 5987 编码
    from urllib.parse import quote
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_', '\u4e00-\u9fff')).strip()[:60]
    fallback_name = f"review_{review_id}.docx"
    display_name = f"{safe_title}.docx" if safe_title else fallback_name
    encoded_name = quote(display_name)

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=\"{fallback_name}\"; filename*=UTF-8''{encoded_name}",
        },
    )


@router.get(
    "/{review_id}/export/pdf",
    summary="导出综述为 PDF 格式",
)
def export_review_pdf(
    review_id: int,
    db: Session = Depends(get_db),
):
    """
    将综述导出为 PDF 格式（学术排版：A4、Times New Roman、页码、1.6 倍行距）。
    返回二进制文件流，可直接下载。
    """
    from app.services.export_service import export_review_to_pdf
    from fastapi.responses import Response

    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    content = review.content
    if not content:
        raise HTTPException(status_code=400, detail="Review has no content to export")

    title = review.title or "Literature Review"

    try:
        pdf_bytes = export_review_to_pdf(content, title)
    except RuntimeError as e:
        # xhtml2pdf not installed
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        logger.error(f"PDF export failed for review {review_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF 导出失败: {e}")

    # Sanitize filename — 中文需要 RFC 5987 编码
    from urllib.parse import quote
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_', '\u4e00-\u9fff')).strip()[:60]
    fallback_name = f"review_{review_id}.pdf"
    display_name = f"{safe_title}.pdf" if safe_title else fallback_name
    encoded_name = quote(display_name)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=\"{fallback_name}\"; filename*=UTF-8''{encoded_name}",
        },
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


# ============================================================
# Abstract / Conclusion / Claims-Evidence / Citation Validation
# ============================================================

@router.post(
    "/{review_id}/generate-abstract",
    summary="为已有综述生成 Abstract（摘要）",
)
async def generate_abstract(
    review_id: int,
    db: Session = Depends(get_db),
):
    """
    基于综述正文内容，调用 LLM 自动生成学术摘要，并更新到 Review.abstract 字段。
    """
    from app.services.review_orchestrator import ReviewOrchestrationService

    try:
        abstract = await ReviewOrchestrationService.generate_abstract_for_review(db, review_id)
        return {
            "success": True,
            "review_id": review_id,
            "abstract": abstract,
            "message": "摘要生成成功" if abstract else "摘要生成为空",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Generate abstract failed for review {review_id}: {e}", exc_info=True)
        try:
            import traceback as _traceback
            with open("api_review_error.log", "a", encoding="utf-8") as _f:
                _f.write(f"\n=== generate-abstract review_id={review_id} ===\n")
                _f.write(_traceback.format_exc())
                _f.write("\n")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"摘要生成失败: {e}")


@router.post(
    "/{review_id}/generate-conclusion",
    summary="为已有综述生成 Conclusion（结论）",
)
async def generate_conclusion(
    review_id: int,
    db: Session = Depends(get_db),
):
    """
    基于综述正文内容，调用 LLM 自动生成学术结论章节，
    并保存到 Review.conclusion 独立字段，同时通过 composer 重新组装完整文档。
    """
    from app.services.review_orchestrator import ReviewOrchestrationService

    try:
        conclusion = await ReviewOrchestrationService.generate_conclusion_for_review(db, review_id)
        return {
            "success": True,
            "review_id": review_id,
            "conclusion": conclusion,
            "message": "结论生成成功" if conclusion else "结论生成为空",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Generate conclusion failed for review {review_id}: {e}", exc_info=True)
        try:
            import traceback as _traceback
            with open("api_review_error.log", "a", encoding="utf-8") as _f:
                _f.write(f"\n=== generate-conclusion review_id={review_id} ===\n")
                _f.write(_traceback.format_exc())
                _f.write("\n")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"结论生成失败: {e}")


@router.patch(
    "/{review_id}/sections",
    summary="编辑综述的 Abstract / Conclusion / References 独立字段",
)
def update_review_sections(
    review_id: int,
    payload: ReviewSectionsUpdate,
    db: Session = Depends(get_db),
):
    """
    PATCH 端点：允许前端独立编辑并保存综述的摘要、结论和参考文献元数据。
    只更新 payload 中非 None 的字段，更新后通过 document_composer 重新组装 content。
    """
    from app.services.document_composer import compose_full_document

    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    updated_fields = []

    if payload.abstract is not None:
        review.abstract = payload.abstract
        updated_fields.append("abstract")

    if payload.conclusion is not None:
        review.conclusion = payload.conclusion
        updated_fields.append("conclusion")

    if payload.references_json is not None:
        review.references_json = payload.references_json
        updated_fields.append("references_json")

    if not updated_fields:
        return {
            "success": True,
            "review_id": review_id,
            "message": "没有需要更新的字段",
            "updated_fields": [],
        }

    # 重新组装完整文档
    review.content = compose_full_document(review)
    review.word_count = len(review.content)

    db.commit()

    return {
        "success": True,
        "review_id": review_id,
        "message": f"已更新: {', '.join(updated_fields)}",
        "updated_fields": updated_fields,
    }


@router.get(
    "/{review_id}/claims-evidence",
    summary="查询综述的论点-证据结构化数据",
)
def get_claims_evidence(
    review_id: int,
    db: Session = Depends(get_db),
):
    """
    返回综述的 claim→supporting_papers 映射数据。
    数据来源: Review.analysis_json.claims_evidence
    """
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    analysis = review.analysis_json or {}
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except Exception:
            analysis = {}

    claims_evidence = analysis.get("claims_evidence", {})

    return {
        "review_id": review_id,
        "claims_evidence": claims_evidence,
        "total_claims": len(claims_evidence),
    }


@router.post(
    "/{review_id}/validate-citations",
    summary="校验综述中的引用完整性",
)
def validate_citations(
    review_id: int,
    db: Session = Depends(get_db),
):
    """
    自动检测综述中的引用异常：
    1. 正文中引用但参考文献列表中缺失的文献
    2. 参考文献列表中存在但正文未引用的文献
    3. 引用格式异常（如括号不匹配）
    4. 重复引用检测
    """
    from app.models.review import ReviewPaper
    from app.models.paper import Paper as PaperModel
    import re

    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    content = review.content or ""
    issues = []

    # 1. Extract all inline citations from content: (Author, Year) or (Author & Author, Year) patterns
    inline_citation_pattern = r'\(([A-Z][a-z]+(?:\s+(?:et\s+al\.|&\s+[A-Z][a-z]+))?(?:,?\s*\d{4}))\)'
    inline_citations = re.findall(inline_citation_pattern, content)

    # 2. Extract [[REF_x]] style citations still present (unresolved)
    unresolved_refs = re.findall(r'\[\[REF_\d+\]\]', content)
    for ref in unresolved_refs:
        issues.append({
            "type": "unresolved_reference",
            "severity": "error",
            "message": f"未解析的引用占位符: {ref}",
            "location": ref,
        })

    # 3. Get linked papers from DB
    review_papers = db.query(ReviewPaper).filter(ReviewPaper.review_id == review_id).all()
    linked_paper_ids = {rp.paper_id for rp in review_papers}

    linked_papers = []
    if linked_paper_ids:
        linked_papers = db.query(PaperModel).filter(PaperModel.id.in_(list(linked_paper_ids))).all()

    # 4. Check for papers in reference list but not cited in body
    for paper in linked_papers:
        # Build author surname for matching
        author_surname = ""
        if paper.authors and len(paper.authors) > 0:
            first_author = paper.authors[0] if isinstance(paper.authors, list) else str(paper.authors).split(",")[0]
            parts = first_author.strip().split()
            author_surname = parts[-1] if parts else ""

        if author_surname and author_surname not in content:
            issues.append({
                "type": "uncited_reference",
                "severity": "warning",
                "message": f"参考文献中存在但正文未引用: {paper.title[:80]}",
                "paper_id": paper.id,
                "author": author_surname,
            })

    # 5. Check for mismatched parentheses in citations
    open_parens = content.count('(')
    close_parens = content.count(')')
    if open_parens != close_parens:
        issues.append({
            "type": "bracket_mismatch",
            "severity": "warning",
            "message": f"括号不匹配：开括号 {open_parens} 个，闭括号 {close_parens} 个",
        })

    # 6. Check analysis_json for citation_map integrity
    analysis = review.analysis_json or {}
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except Exception:
            analysis = {}

    citation_map = analysis.get("citation_map", {})
    for ref_key, paper_id in citation_map.items():
        if isinstance(paper_id, int) and paper_id not in linked_paper_ids:
            issues.append({
                "type": "orphan_citation_map",
                "severity": "error",
                "message": f"citation_map 中的 {ref_key} 指向 paper_id={paper_id}，但该文献未关联到综述",
                "ref_key": ref_key,
                "paper_id": paper_id,
            })

    # 7. Duplicate detection (same author+year cited multiple times in same sentence)
    sentences = re.split(r'[.。!！?？]', content)
    for sentence in sentences:
        sentence_citations = re.findall(inline_citation_pattern, sentence)
        seen = set()
        for cite in sentence_citations:
            if cite in seen:
                issues.append({
                    "type": "duplicate_citation",
                    "severity": "info",
                    "message": f"同一句中重复引用: ({cite})",
                    "location": sentence[:80],
                })
            seen.add(cite)

    # Summary
    error_count = sum(1 for i in issues if i["severity"] == "error")
    warning_count = sum(1 for i in issues if i["severity"] == "warning")
    info_count = sum(1 for i in issues if i["severity"] == "info")

    return {
        "review_id": review_id,
        "valid": error_count == 0,
        "total_issues": len(issues),
        "errors": error_count,
        "warnings": warning_count,
        "info": info_count,
        "issues": issues,
        "stats": {
            "inline_citations_found": len(inline_citations),
            "linked_papers": len(linked_papers),
            "unresolved_refs": len(unresolved_refs),
        },
    }


@router.get("/{review_id}", response_model=ReviewResponse)
def get_review_by_id(review_id: int, db: Session = Depends(get_db)):
    """
    根据 ID 获取单条综述信息（包括 framework）
    方便你在没有前端页面的情况下，直接通过 /api/docs 查看 JSON 结果。
    """
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


@router.delete(
    "/{review_id}",
    summary="删除指定综述",
)
def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
):
    """
    物理删除综述记录及其关联。
    """
    from app.models import ReviewPaper
    
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    # 删除关联
    db.query(ReviewPaper).filter(ReviewPaper.review_id == review_id).delete()
    # 删除综述
    db.delete(review)
    db.commit()
    
    return {"success": True, "message": f"Review {review_id} deleted"}

