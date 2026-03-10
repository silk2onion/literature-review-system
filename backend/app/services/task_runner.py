"""
Async Task Runner for PhD Pipeline

Provides:
- TaskStore: in-memory task state management
- with_retry: exponential backoff retry for Gemini API calls
- PipelineTaskRunner: runs the full pipeline async in background
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from app.models.staging_paper import StagingPaper
from app.models.paper import Paper as PaperModel
from app.models.pipeline_task import PipelineTask
from app.database import SessionLocal
from app.services.paper_ingest import paper_to_source_paper, insert_or_update_papers_from_sources
from app.services.llm.prompts import RELEVANCE_SCORING_PROMPT

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────
# Data models for task state
# ────────────────────────────────────────────────────────────

class StepLog:
    def __init__(self, step: str, label: str):
        self.step = step          # internal key
        self.label = label        # display label
        self.status = "pending"   # pending | running | done | failed | retrying
        self.message = ""
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None
        self.attempt = 1
        self.max_attempts = 3

    def elapsed(self) -> Optional[float]:
        if self.started_at is None:
            return None
        end = self.finished_at or time.time()
        return round(end - self.started_at, 1)

    def to_dict(self) -> Dict:
        return {
            "step": self.step,
            "label": self.label,
            "status": self.status,
            "message": self.message,
            "elapsed": self.elapsed(),
            "attempt": self.attempt,
            "max_attempts": self.max_attempts,
        }


class TaskState:
    def __init__(self, task_id: str, topic: str, keywords: List[str], papers_per_section: int, sources: List[str], language: str, citation_style: str):
        self.task_id = task_id
        self.topic = topic
        self.keywords = keywords
        self.papers_per_section = papers_per_section
        self.sources = sources
        self.language = language
        self.citation_style = citation_style
        self.status = "pending"   # pending | running | done | failed
        self.created_at = datetime.now().isoformat()
        self.finished_at: Optional[str] = None
        self.error: Optional[str] = None

        # intermediate results (stored for final assembly)
        self.framework: Optional[Dict] = None
        self.review_id: Optional[int] = None
        self.full_markdown: Optional[str] = None
        self.references_markdown: Optional[str] = None
        self.total_cited_papers: int = 0
        self.paper_ids: List[int] = []  # IDs of papers that passed relevance filtering

        # Checkpoint data: stores serialised intermediate products for resume
        self.checkpoint_data: Dict[str, Any] = {}
        # last_completed_step: the step_key of the latest successfully completed step
        self.last_completed_step: Optional[str] = None

        # event queue for SSE streaming
        self.event_queue: asyncio.Queue = asyncio.Queue()

        # ordered pipeline steps
        self.steps: List[StepLog] = [
            StepLog("framework",    "生成文献综述框架"),
            StepLog("auto_search",  "自动检索各节文献"),
            StepLog("claims",       "生成论点 (Claims)"),
            StepLog("evidence",     "关联 RAG 证据"),
            StepLog("render",       "渲染各章节正文"),
            StepLog("assemble",     "组装完整综述 + 参考文献"),
        ]

    def get_step(self, step_key: str) -> Optional[StepLog]:
        return next((s for s in self.steps if s.step == step_key), None)

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "status": self.status,
            "topic": self.topic,
            "keywords": self.keywords,
            "papers_per_section": self.papers_per_section,
            "sources": self.sources,
            "language": self.language,
            "citation_style": self.citation_style,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "review_id": self.review_id,
            "full_markdown": self.full_markdown,
            "references_markdown": self.references_markdown,
            "total_cited_papers": self.total_cited_papers,
            "paper_ids": self.paper_ids,
            "checkpoint_data": self.checkpoint_data,
            "last_completed_step": self.last_completed_step,
            "steps": [s.to_dict() for s in self.steps],
        }

    @classmethod
    def from_dict(cls, data: Dict) -> TaskState:
        t = cls(
            task_id=data.get("task_id", ""),
            topic=data.get("topic", ""),
            keywords=data.get("keywords", []),
            papers_per_section=data.get("papers_per_section", 20),
            sources=data.get("sources", ["semantic_scholar"]),
            language=data.get("language", "zh-CN"),
            citation_style=data.get("citation_style", "harvard")
        )
        t.status = data.get("status", "pending")
        t.created_at = data.get("created_at", datetime.now().isoformat())
        t.finished_at = data.get("finished_at")
        t.error = data.get("error")
        t.review_id = data.get("review_id")
        t.full_markdown = data.get("full_markdown")
        t.references_markdown = data.get("references_markdown")
        t.total_cited_papers = data.get("total_cited_papers", 0)
        t.paper_ids = data.get("paper_ids", [])
        t.checkpoint_data = data.get("checkpoint_data", {})
        t.last_completed_step = data.get("last_completed_step")
        
        if "steps" in data:
            t.steps = []
            for s in data["steps"]:
                step = StepLog(s.get("step", ""), s.get("label", ""))
                step.status = s.get("status", "pending")
                step.message = s.get("message", "")
                step.attempt = s.get("attempt", 1)
                step.max_attempts = s.get("max_attempts", 3)
                t.steps.append(step)
                
        return t


# ────────────────────────────────────────────────────────────
# In-memory task store
# ────────────────────────────────────────────────────────────

_task_store: Dict[str, TaskState] = {}
_store_lock = asyncio.Lock()


async def create_task(
    topic: str,
    keywords: List[str],
    papers_per_section: int = 20,
    sources: Optional[List[str]] = None,
    language: str = "zh-CN",
    citation_style: str = "harvard",
) -> TaskState:
    task_id = str(uuid.uuid4())[:8]
    task = TaskState(
        task_id=task_id,
        topic=topic,
        keywords=keywords,
        papers_per_section=papers_per_section,
        sources=sources or ["semantic_scholar"],
        language=language,
        citation_style=citation_style,
    )
    
    # Save to database initially
    try:
        with SessionLocal() as db:
            db_task = PipelineTask(
                task_id=task.task_id,
                topic=task.topic,
                keywords=task.keywords,
                status=task.status,
                state_data=task.to_dict(),
            )
            db.add(db_task)
            db.commit()
    except Exception as e:
        logger.error(f"Failed to create DB task for {task_id}: {e}")

    async with _store_lock:
        _task_store[task_id] = task
    return task


def get_task(task_id: str) -> Optional[TaskState]:
    # 1. Look in memory cache
    task = _task_store.get(task_id)
    if task:
        return task
        
    # 2. Look in database (history fallback)
    try:
        with SessionLocal() as db:
            db_task = db.query(PipelineTask).filter(PipelineTask.task_id == task_id).first()
            if db_task and db_task.state_data:
                # Reconstruct task state from db JSON and store briefly in memory
                restored_task = TaskState.from_dict(db_task.state_data)
                _task_store[task_id] = restored_task
                return restored_task
    except Exception as e:
        logger.error(f"Failed to retrieve DB task {task_id}: {e}")
        
    return None


def list_tasks() -> List[Dict]:
    # 1. Get from DB
    tasks_dict = {}
    try:
        with SessionLocal() as db:
            db_tasks = db.query(PipelineTask).order_by(PipelineTask.created_at.desc()).limit(50).all()
            for t in db_tasks:
                if t.state_data:
                    tasks_dict[t.task_id] = t.state_data
    except Exception as e:
        logger.error(f"Failed to list DB tasks: {e}")

    # 2. Overlay memory
    for task_id, task in _task_store.items():
        tasks_dict[task_id] = task.to_dict()
        
    # Sort by created_at descending
    result = list(tasks_dict.values())
    try:
        result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    except Exception:
        pass
    return result


async def resume_task(task_id: str, db: Session) -> TaskState:
    """
    Resume a failed/stopped task from its last checkpoint.
    Returns the TaskState (now running again).
    """
    task = get_task(task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")
    
    if task.status not in ("failed", "done"):
        raise ValueError(f"Task {task_id} is in status '{task.status}', can only resume failed tasks")
    
    last_step = task.last_completed_step
    if not last_step:
        # No checkpoint at all — need to start from scratch
        resume_from = None
    else:
        # Find the NEXT step after the last completed one
        step_order = PipelineTaskRunner.STEP_ORDER
        try:
            idx = step_order.index(last_step)
            if idx + 1 < len(step_order):
                resume_from = step_order[idx + 1]
            else:
                raise ValueError(f"Task {task_id} already completed all steps")
        except ValueError:
            resume_from = None
    
    # Re-register in memory store
    async with _store_lock:
        _task_store[task_id] = task
    
    # Launch the runner in background
    runner = PipelineTaskRunner(task, db)
    asyncio.create_task(runner.run(resume_from=resume_from))
    
    return task


# ────────────────────────────────────────────────────────────
# Retry helper
# ────────────────────────────────────────────────────────────

async def with_retry(coro_fn, max_attempts: int = 5, initial_delay: float = 3.0, step_log: Optional[StepLog] = None):
    """
    Run an async function with exponential backoff retry.
    Catches common Gemini API errors and retries up to max_attempts times.
    """
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        if step_log:
            step_log.attempt = attempt
            step_log.max_attempts = max_attempts
        try:
            return await coro_fn()
        except Exception as e:
            last_exc = e
            err_str = str(e).lower()
            is_retriable = any(word in err_str for word in [
                "rate limit", "429", "timeout", "503", "overloaded",
                "resource_exhausted", "quota", "temporarily unavailable",
                "high demand", "spikes in demand", "experiencing",
                "500", "502", "server error", "capacity",
                "connection", "reset", "refused",
            ])
            if not is_retriable or attempt == max_attempts:
                raise

            delay = initial_delay * (2 ** (attempt - 1))  # 3s, 6s, 12s, 24s
            logger.warning(f"[Retry] attempt {attempt}/{max_attempts} failed: {e}. Retrying in {delay}s...")

            if step_log:
                step_log.status = "retrying"
                step_log.message = f"API 调用失败，{delay:.0f}s 后重试 (第{attempt}次/共{max_attempts}次)"

            await asyncio.sleep(delay)

    raise last_exc



# ────────────────────────────────────────────────────────────
# Pipeline runner
# ────────────────────────────────────────────────────────────

class PipelineTaskRunner:
    """Runs the full PhD pipeline asynchronously, updating task state."""

    def __init__(self, task: TaskState, db: Session):
        self.task = task
        self.db = db

    def _emit(self, event_type: str, data: Any):
        """Push an SSE event to the task's event queue and persist state."""
        try:
            self.task.event_queue.put_nowait({
                "event": event_type,
                "data": data,
            })
        except asyncio.QueueFull:
            pass  # drop if queue full
            
        # Background DB update
        self._persist_task_state_bg()

    def _persist_task_state_bg(self):
        """Asynchronously flush memory state to DB to not block current step"""
        state_snapshot = self.task.to_dict()
        task_id = self.task.task_id
        status = self.task.status
        topic = self.task.topic
        keywords = self.task.keywords
        finished_at = self.task.finished_at
        error = getattr(self.task, "error", None)
        review_id = self.task.review_id
        
        def save():
            try:
                # using a short-lived local session to avoid thread conflicts
                with SessionLocal() as db_session:
                    db_task = db_session.query(PipelineTask).filter(PipelineTask.task_id == task_id).first()
                    if db_task:
                        db_task.status = status
                        db_task.state_data = state_snapshot
                        if finished_at:
                            try:
                                db_task.finished_at = datetime.fromisoformat(finished_at) if isinstance(finished_at, str) else datetime.utcfromtimestamp(finished_at)
                            except:
                                db_task.finished_at = datetime.utcnow()
                        db_task.error = error
                        db_task.review_id = review_id
                        db_session.commit()
            except Exception as e:
                logger.error(f"Background save failed for task {task_id}: {e}")
                
        # run in executor to not block async loop
        try:
            loop = asyncio.get_running_loop()
            loop.run_in_executor(None, save)
        except Exception:
            # if no loop, run synchronous
            save()

    # Pipeline step ordering for resume logic
    STEP_ORDER = ["framework", "auto_search", "claims", "evidence", "render", "assemble"]

    def _save_checkpoint(self, step_key: str, data: Dict[str, Any] = None):
        """Save a checkpoint after a successful step."""
        self.task.last_completed_step = step_key
        if data:
            self.task.checkpoint_data[step_key] = data
        # Force a persist to DB
        self._persist_task_state_bg()

    def _step_start(self, step_key: str, message: str = ""):
        step = self.task.get_step(step_key)
        if step:
            step.status = "running"
            step.started_at = time.time()
            step.message = message or f"正在执行：{step.label}"
        self._emit("step_update", self.task.to_dict())

    def _step_done(self, step_key: str, message: str = ""):
        step = self.task.get_step(step_key)
        if step:
            step.status = "done"
            step.finished_at = time.time()
            step.message = message or "完成"
        self._emit("step_update", self.task.to_dict())

    def _step_fail(self, step_key: str, error: str):
        step = self.task.get_step(step_key)
        if step:
            step.status = "failed"
            step.finished_at = time.time()
            step.message = f"失败: {error}"
        self._emit("step_update", self.task.to_dict())

    def _should_skip(self, step_key: str, resume_from: Optional[str]) -> bool:
        """Check if a step should be skipped during resume."""
        if resume_from is None:
            return False
        try:
            resume_idx = self.STEP_ORDER.index(resume_from)
            step_idx = self.STEP_ORDER.index(step_key)
            return step_idx < resume_idx
        except ValueError:
            return False

    def _restore_checkpoint(self, resume_from: str):
        """Restore intermediate products from checkpoint_data before resuming."""
        cp = self.task.checkpoint_data
        
        # Restore framework (needed by step 2+)
        if "framework" in cp:
            self.task.framework = cp["framework"].get("framework")

        # Restore paper_ids (needed by step 3+)
        if "auto_search" in cp:
            self.task.paper_ids = cp["auto_search"].get("paper_ids", [])
            
        # Restore claim_table (needed by step 4+)
        if "claims" in cp:
            from app.schemas.review import SectionClaimTable
            self._claim_table = SectionClaimTable.model_validate(cp["claims"]["claim_table"])
            self.task.review_id = cp["claims"].get("review_id")

        # Restore claim_table with evidence (needed by step 5+)
        if "evidence" in cp:
            from app.schemas.review import SectionClaimTable
            self._claim_table = SectionClaimTable.model_validate(cp["evidence"]["claim_table"])

        # Restore rendered sections (needed by step 6)
        if "render" in cp:
            self._rendered_sections = cp["render"].get("rendered_sections", [])
            self._all_citation_map = cp["render"].get("all_citation_map", {})
        
        logger.info(f"[Task {self.task.task_id}] Restored checkpoint up to step '{resume_from}'")

    async def run(self, resume_from: Optional[str] = None):
        """Main pipeline execution. If resume_from is set, skip steps before it."""
        self.task.status = "running"
        self.task.error = None  # Clear any previous error
        self.task.finished_at = None
        
        if resume_from:
            logger.info(f"[Task {self.task.task_id}] Resuming from step '{resume_from}'")
            self._restore_checkpoint(resume_from)
            # Reset failed/pending steps from resume_from onwards
            should_reset = False
            for step in self.task.steps:
                if step.step == resume_from:
                    should_reset = True
                if should_reset:
                    step.status = "pending"
                    step.message = ""
                    step.started_at = None
                    step.finished_at = None

        self._emit("task_start", {"task_id": self.task.task_id, "topic": self.task.topic})

        try:
            if not self._should_skip("framework", resume_from):
                await self._step_generate_framework()
            if not self._should_skip("auto_search", resume_from):
                await self._step_auto_search()
            if not self._should_skip("claims", resume_from):
                await self._step_generate_claims()
            if not self._should_skip("evidence", resume_from):
                await self._step_attach_evidence()
            if not self._should_skip("render", resume_from):
                await self._step_render_all()
            if not self._should_skip("assemble", resume_from):
                await self._step_assemble()

            self.task.status = "done"
            self.task.finished_at = datetime.now().isoformat()
            self._emit("task_done", self.task.to_dict())
            logger.info(f"[Task {self.task.task_id}] Completed successfully")

        except Exception as e:
            self.task.status = "failed"
            self.task.error = str(e)
            self.task.finished_at = datetime.now().isoformat()
            self._emit("task_error", {"error": str(e), "task": self.task.to_dict()})
            logger.error(f"[Task {self.task.task_id}] Failed: {e}", exc_info=True)

    # ── Step 1: Generate Framework ──────────────────────────

    async def _step_generate_framework(self):
        from app.config import settings
        from app.services.llm.openai_service import OpenAIService
        from app.services.llm.prompts import ORCHESTRATE_FRAMEWORK_PROMPT

        step_key = "framework"
        self._step_start(step_key, "调用 LLM 生成文献综述框架...")

        step = self.task.get_step(step_key)

        async def _call():
            llm = OpenAIService(settings=settings)
            kws = ", ".join(self.task.keywords)
            lang_label = "中文" if self.task.language.startswith("zh") else "English"
            prompt = ORCHESTRATE_FRAMEWORK_PROMPT.format(
                topic=self.task.topic,
                keywords=kws,
                language=lang_label,
                custom_instructions="",
            )
            system_prompt = (
                "You are an expert academic researcher. Generate a LITERATURE REVIEW outline "
                "(not a PhD research plan). Include 3-6 sections with search_keywords per section."
            )
            raw = await llm.complete(prompt=prompt, system_prompt=system_prompt, temperature=0.3, max_tokens=2000)
            return raw

        try:
            raw = await with_retry(_call, max_attempts=3, step_log=step)
            # Parse JSON
            json_text = raw.strip()
            for marker in ["```json", "```"]:
                if marker in json_text:
                    start = json_text.index(marker) + len(marker)
                    json_text = json_text[start:json_text.index("```", start)].strip()
                    break
            framework = json.loads(json_text)
            self.task.framework = framework
            sections_count = len(framework.get("sections", []))
            self._step_done(step_key, f"框架生成完成：{sections_count} 个章节")
            self._save_checkpoint("framework", {"framework": self.task.framework})
        except Exception as e:
            self._step_fail(step_key, str(e))
            raise

    # ── Step 2: Auto-search per section ─────────────────────

    async def _step_auto_search(self):
        from app.services.crawl_service import create_crawl_job, run_crawl_job_once
        from app.schemas import CrawlJobCreate

        step_key = "auto_search"
        sections = (self.task.framework or {}).get("sections", [])
        self._step_start(step_key, f"开始为 {len(sections)} 个章节搜索文献...")

        step = self.task.get_step(step_key)
        total_new = 0
        job_ids = []

        for i, section in enumerate(sections):
            sec_title = section.get("title", f"Section {i+1}")
            
            # LLM Query Expansion
            from app.services.llm.openai_service import OpenAIService
            from app.services.llm.prompts import SEARCH_QUERY_EXPANSION_PROMPT
            from app.config import settings
            import json
            
            llm = OpenAIService(settings=settings)
            
            sec_keywords_raw = section.get("search_keywords", self.task.keywords[:3])
            
            prompt = SEARCH_QUERY_EXPANSION_PROMPT.format(
                topic=self.task.topic,
                section_title=sec_title,
                section_keywords=sec_keywords_raw
            )
            
            tiers = []
            try:
                result = await llm.complete_json(prompt=prompt, system_prompt="You are an expert academic librarian.", temperature=0.3)
                if result.get("tier1"):
                    tiers.append(result.get("tier1"))
                if result.get("tier2"):
                    tiers.append(result.get("tier2"))
                if result.get("tier3"):
                    tiers.append(result.get("tier3"))
            except Exception as e:
                logger.warning(f"LLM Query expansion failed: {e}")
            
            # Fallback if LLM failed
            if not tiers:
                if isinstance(sec_keywords_raw, str):
                    import re as _re
                    kws = [k.strip() for k in _re.split(r'[,，]', sec_keywords_raw) if k.strip()]
                    tiers.append(" ".join(kws[:3]))
                elif isinstance(sec_keywords_raw, list):
                    kws = [str(k).strip() for k in sec_keywords_raw if str(k).strip()]
                    tiers.append(" ".join(kws[:3]))
                else:
                    tiers.append(" ".join(self.task.keywords[:3]))
            
            section_new_count = 0
            for tier_idx, tier_query in enumerate(tiers):
                if step:
                    step.message = f"正在搜索第 {i+1}/{len(sections)} 节 (策略 {tier_idx+1})：{sec_title}"
                self._emit("step_update", self.task.to_dict())
                
                # Convert string query to list of words for the crawler
                import re as _re
                # Split by comma or space
                sec_keywords = [k.strip() for k in _re.split(r'[,\s+]', tier_query) if k.strip()]
                sec_keywords = [k[:40] for k in sec_keywords][:4] # max 4 terms
                
                if not sec_keywords:
                    continue

                try:
                    def _make_job(kws=sec_keywords):
                        return CrawlJobCreate(
                            keywords=kws,
                            sources=self.task.sources,
                            max_results=self.task.papers_per_section,
                            page_size=min(self.task.papers_per_section, 50),
                        )

                    job_payload = _make_job()
                    job = create_crawl_job(db=self.db, payload=job_payload)
                    job_ids.append(job.id)

                    # Run in thread pool to avoid blocking event loop
                    loop = asyncio.get_event_loop()
                    job, new_count = await loop.run_in_executor(
                        None, lambda: run_crawl_job_once(self.db, job.id)
                    )
                    section_new_count += new_count
                    total_new += new_count
                    
                    if section_new_count > 0:
                        logger.info(f"Section {i+1} found {section_new_count} papers at tier {tier_idx+1}. Skipping broader tiers.")
                        break
                        
                    await asyncio.sleep(0.5)

                except Exception as e:
                    logger.warning(f"[Task {self.task.task_id}] Auto-search failed for section {i+1} tier {tier_idx+1}: {e}")

        self._step_done(step_key, f"检索完成：共获取约 {total_new} 篇新文献")

        # --- AI Relevance Filtering & Auto-Promotion ---
        if total_new > 0 or True: # Always check if papers were found
            self._step_start(step_key, "AI 正在对获取的文献进行学科相关度审查 (AI Relevance Filter)...")
            
            from app.services.llm.openai_service import OpenAIService
            from app.config import settings
            llm = OpenAIService(settings=settings)
            
            if not job_ids:
                self._step_done(step_key, "检索完成：未产生爬虫任务")
                return

            staging_papers = self.db.query(StagingPaper).filter(
                StagingPaper.status == "pending",
                StagingPaper.crawl_job_id.in_(job_ids)
            ).order_by(StagingPaper.created_at.desc()).all()
            
            accepted_papers = []
            reviewed_count = 0
            
            for sp in staging_papers:
                reviewed_count += 1
                prompt = RELEVANCE_SCORING_PROMPT.format(
                    topic=self.task.topic,
                    title=sp.title,
                    abstract=sp.abstract or "No abstract available."
                )
                try:
                    result = await llm.complete_json(prompt=prompt, system_prompt="You are a professional academic reviewer.", temperature=0.1)
                    score = result.get("score", 0)
                    reason = result.get("reason", "")
                    
                    if score >= 7:
                        # Promote to official Paper table
                        source_paper = paper_to_source_paper(sp) # Use the utility from paper_ingest
                        official_papers, _ = insert_or_update_papers_from_sources(self.db, [source_paper])
                        if official_papers:
                            self.task.paper_ids.append(official_papers[0].id)
                            accepted_papers.append(official_papers[0])
                        sp.status = "promoted"
                        sp.llm_score = score
                        sp.llm_tags = [f"relevance:{score}", reason[:50]]
                    else:
                        sp.status = "rejected"
                        sp.llm_score = score
                        sp.llm_tags = [f"irrelevant:{score}", reason[:50]]
                    
                    self.db.commit()
                except Exception as e:
                    logger.warning(f"Relevance scoring failed for paper {sp.id}: {e}")
                
                if reviewed_count % 5 == 0:
                    self._step_start(step_key, f"已审查 {reviewed_count} 篇文献，采纳 {len(accepted_papers)} 篇...")

            self._step_done(step_key, f"审查完成：总共发现 {reviewed_count} 篇文献，AI 采纳了 {len(accepted_papers)} 篇符合课题方向的文献。")
            self._save_checkpoint("auto_search", {"paper_ids": self.task.paper_ids})

    # ── Step 3: Generate Claims ──────────────────────────────

    async def _step_generate_claims(self):
        from app.services.review import SectionReviewPipelineService, generate_review as core_generate_review
        from app.services.semantic_search import get_semantic_search_service
        from app.config import settings
        from app.services.llm.openai_service import OpenAIService
        from app.schemas.review import ReviewGenerate

        step_key = "claims"
        self._step_start(step_key, "生成综述论点结构...")

        step = self.task.get_step(step_key)

        async def _call():
            payload = ReviewGenerate(
                keywords=self.task.keywords,
                paper_ids=self.task.paper_ids, # Pass the filtered papers
                phd_pipeline=True,
                framework_only=True,
            )
            gen_resp = await core_generate_review(db=self.db, payload=payload)
            if not gen_resp.success:
                raise RuntimeError(f"init failed: {gen_resp.message}")

            self.task.review_id = gen_resp.review_id
            framework_md = gen_resp.preview_markdown or ""

            llm = OpenAIService(settings=settings)
            sem = get_semantic_search_service()
            pipeline = SectionReviewPipelineService(db=self.db, llm_service=llm, semantic_search_service=sem)
            table = await pipeline.generate_section_claims(
                review_id=gen_resp.review_id,
                section_outline=framework_md,
            )
            return table

        try:
            self._claim_table = await with_retry(_call, max_attempts=3, step_log=step)
            claims_count = len(self._claim_table.claims)
            self._step_done(step_key, f"生成了 {claims_count} 条论点")
            self._save_checkpoint("claims", {
                "claim_table": self._claim_table.model_dump(),
                "review_id": self.task.review_id,
            })
        except Exception as e:
            self._step_fail(step_key, str(e))
            raise

    # ── Step 4: Attach Evidence ──────────────────────────────

    async def _step_attach_evidence(self):
        from app.services.review import SectionReviewPipelineService
        from app.services.semantic_search import get_semantic_search_service
        from app.config import settings
        from app.services.llm.openai_service import OpenAIService

        step_key = "evidence"
        self._step_start(step_key, "RAG 检索相关文献证据...")
        step = self.task.get_step(step_key)

        async def _call():
            llm = OpenAIService(settings=settings)
            sem = get_semantic_search_service()
            pipeline = SectionReviewPipelineService(db=self.db, llm_service=llm, semantic_search_service=sem)
            return await pipeline.attach_evidence_for_claims(
                table=self._claim_table, 
                top_k=5, 
                paper_ids=self.task.paper_ids if self.task.paper_ids else None
            )

        try:
            self._claim_table = await with_retry(_call, max_attempts=3, step_log=step)
            papers_found = sum(len(c.support_papers or []) for c in self._claim_table.claims)
            self._step_done(step_key, f"为 {len(self._claim_table.claims)} 条论点关联了约 {papers_found} 篇文献")
            self._save_checkpoint("evidence", {
                "claim_table": self._claim_table.model_dump(),
            })
        except Exception as e:
            self._step_fail(step_key, str(e))
            raise

    # ── Step 5: Render all sections ──────────────────────────

    async def _step_render_all(self):
        from app.services.review import SectionReviewPipelineService
        from app.services.semantic_search import get_semantic_search_service
        from app.config import settings
        from app.services.llm.openai_service import OpenAIService
        from app.schemas.review import SectionClaimTable

        step_key = "render"
        self._step_start(step_key, "LLM 渲染各章节正文...")
        step = self.task.get_step(step_key)

        # Group claims by section
        sections_map: Dict[str, List] = {}
        for claim in self._claim_table.claims:
            sec_id = getattr(claim, "section_id", "1")
            sections_map.setdefault(sec_id, []).append(claim)

        self._rendered_sections: List[Dict] = []
        self._all_citation_map: Dict = {}
        total_sections = max(len(sections_map), 1)

        llm = OpenAIService(settings=settings)
        sem = get_semantic_search_service()
        pipeline = SectionReviewPipelineService(db=self.db, llm_service=llm, semantic_search_service=sem)

        for i, (sec_id, claims) in enumerate(sections_map.items()):
            if step:
                step.message = f"渲染第 {i+1}/{total_sections} 节..."
            self._emit("step_update", self.task.to_dict())

            sec_title = claims[0].section_title if hasattr(claims[0], "section_title") else f"Section {i+1}"
            mini_table = SectionClaimTable(
                section_id=sec_id,
                section_title=sec_title,
                claims=claims,
            )

            async def _call(tbl=mini_table):
                return await pipeline.render_section_from_claims(
                    table=tbl,
                    language=self.task.language,
                    review_id=self.task.review_id,
                )

            try:
                rendered = await with_retry(_call, max_attempts=3, step_log=step)
                self._rendered_sections.append({
                    "section_id": sec_id,
                    "section_title": sec_title,
                    "text": rendered.text,
                    "citation_map": rendered.citation_map or {},
                })
                self._all_citation_map.update(rendered.citation_map or {})
            except Exception as e:
                logger.warning(f"[Task] Render failed for section {sec_id}: {e}")
                self._rendered_sections.append({
                    "section_id": sec_id,
                    "section_title": sec_title,
                    "text": f"*本节渲染失败: {e}*",
                    "citation_map": {},
                })

        self._step_done(step_key, f"完成 {len(self._rendered_sections)} 个章节渲染")
        self._save_checkpoint("render", {
            "rendered_sections": self._rendered_sections,
            "all_citation_map": self._all_citation_map,
        })

    # ── Step 6: Assemble ─────────────────────────────────────

    async def _step_assemble(self):
        from app.services.reference_formatter import get_reference_formatter, CitationStyle
        from app.models.paper import Paper as PaperModel
        from app.models import Review

        step_key = "assemble"
        self._step_start(step_key, "组装完整文档 + 生成参考文献列表...")

        # Collect cited paper IDs
        all_paper_ids: set = set()
        for sec in self._rendered_sections:
            for v in sec.get("citation_map", {}).values():
                if isinstance(v, int):
                    all_paper_ids.add(v)
                elif isinstance(v, str) and v.isdigit():
                    all_paper_ids.add(int(v))

        cited_papers = []
        if all_paper_ids:
            cited_papers = self.db.query(PaperModel).filter(
                PaperModel.id.in_(list(all_paper_ids))
            ).all()

        # Sort & format references
        ref_formatter = get_reference_formatter()
        try:
            style_enum = CitationStyle(self.task.citation_style)
        except ValueError:
            style_enum = CitationStyle.HARVARD

        cited_papers.sort(key=lambda p: (
            (p.authors[0].split()[-1].lower() if p.authors and p.authors[0] else "zzz"),
            p.year or 0,
        ))

        refs_md = ref_formatter.format_reference_list(cited_papers, style=style_enum)
        title = (self.task.framework or {}).get("title") or self.task.topic or "Literature Review"

        # Assemble markdown
        md_lines = [f"# {title}\n"]
        for sec in self._rendered_sections:
            md_lines.append(f"\n## {sec['section_title']}\n")
            md_lines.append(sec.get("text", ""))
        md_lines.append(f"\n## References\n")
        md_lines.append(refs_md)
        full_md = "\n".join(md_lines)

        # Save to DB
        if self.task.review_id:
            review = self.db.query(Review).filter(Review.id == self.task.review_id).first()
            if review:
                review.content = full_md
                self.db.commit()

        self.task.full_markdown = full_md
        self.task.references_markdown = refs_md
        self.task.total_cited_papers = len(cited_papers)

        self._step_done(step_key, f"综述组装完成！共引用 {len(cited_papers)} 篇文献。")
