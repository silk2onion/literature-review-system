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
from app.services.llm.prompts import SEARCH_QUERY_EXPANSION_PROMPT

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
        self.max_attempts = 5

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
        self.status = "pending"   # pending | running | done | failed | cancelled
        self.created_at = datetime.now().isoformat()
        self.finished_at: Optional[str] = None
        self.error: Optional[str] = None
        self.logs: List[str] = [] # Detailed execution logs

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

    def add_log(self, message: str):
        """Append a timestamped log message."""
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{ts}] {message}"
        self.logs.append(log_entry)
        # Keep logs reasonable size
        if len(self.logs) > 500:
            self.logs = self.logs[-500:]

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
            "logs": self.logs,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "TaskState":
        keywords = data.get("keywords", [])
        topic = data.get("topic", "")
        if not keywords:
            # Fallback for old tasks where keywords weren't saved to DB state_data
            keywords = [topic] if topic else ["literature review"]

        t = cls(
            task_id=data.get("task_id", ""),
            topic=topic,
            keywords=keywords,
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
                step.max_attempts = s.get("max_attempts", 5)
                t.steps.append(step)
        
        t.logs = data.get("logs", [])
                
        return t


# ────────────────────────────────────────────────────────────
# In-memory task store
# ────────────────────────────────────────────────────────────

_task_store: Dict[str, TaskState] = {}
_active_runners: set[str] = set()
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


# ────────────────────────────────────────────────────────────
# Manual flow task tracking helpers
# ────────────────────────────────────────────────────────────

# Map manual endpoint steps to pipeline step keys
MANUAL_STEP_MAP = {
    "init":      "framework",      # /phd/init -> framework + claims
    "claims":    "claims",         # /phd/generate-claims
    "auto_search": "auto_search",  # /phd/auto-search
    "evidence":  "evidence",       # /phd/attach-evidence
    "render":    "render",         # /phd/render-section or /phd/render-all
    "assemble":  "assemble",       # /phd/assemble
}


def get_task_by_review_id(review_id: int) -> Optional[TaskState]:
    """Find a PipelineTask linked to a review_id (manual flow)."""
    # 1. Check memory
    for task in _task_store.values():
        if task.review_id == review_id:
            return task

    # 2. Check DB
    try:
        with SessionLocal() as db:
            db_task = db.query(PipelineTask).filter(
                PipelineTask.review_id == review_id
            ).order_by(PipelineTask.created_at.desc()).first()
            if db_task and db_task.state_data:
                restored = TaskState.from_dict(db_task.state_data)
                _task_store[restored.task_id] = restored
                return restored
    except Exception as e:
        logger.error(f"Failed to find task by review_id {review_id}: {e}")

    return None


async def create_manual_task(
    topic: str,
    keywords: List[str],
    review_id: int,
    source: str = "manual",
) -> TaskState:
    """Create a PipelineTask for manual / agent-tool flow, linked to a review_id."""
    task = await create_task(
        topic=topic,
        keywords=keywords,
        papers_per_section=0,
        sources=[],
        language="zh-CN",
        citation_style="harvard",
    )
    task.review_id = review_id
    task.status = "running"
    task.add_log(f"任务由 {source} 流程创建，关联 Review #{review_id}")

    # Persist review_id + running status
    _persist_task_snapshot(task)
    return task


def update_manual_task_step(
    review_id: int,
    step_key: str,
    status: str = "done",
    message: str = "",
    error: str = "",
):
    """
    Update a specific step on the PipelineTask linked to review_id.
    Called by manual endpoints after each stage completes or fails.
    """
    task = get_task_by_review_id(review_id)
    if not task:
        return None

    step = task.get_step(step_key)
    if not step:
        return task

    if status == "running":
        step.status = "running"
        step.started_at = time.time()
        step.message = message or f"正在执行：{step.label}"
    elif status == "done":
        step.status = "done"
        step.finished_at = time.time()
        step.message = message or "完成"
        task.last_completed_step = step_key
    elif status == "failed":
        step.status = "failed"
        step.finished_at = time.time()
        step.message = f"失败: {error or message}"

    # Check if all steps done -> mark task done
    all_done = all(s.status == "done" for s in task.steps)
    if all_done:
        task.status = "done"
        task.finished_at = datetime.now().isoformat()
    elif status == "failed":
        task.status = "failed"
        task.error = error or message
        task.finished_at = datetime.now().isoformat()

    task.add_log(f"[{step_key}] {status}: {message or error or step.label}")
    _persist_task_snapshot(task)
    return task


def _persist_task_snapshot(task: TaskState):
    """Flush in-memory task state to DB."""
    try:
        with SessionLocal() as db_session:
            db_task = db_session.query(PipelineTask).filter(
                PipelineTask.task_id == task.task_id
            ).first()
            if db_task:
                db_task.status = task.status
                db_task.state_data = task.to_dict()
                db_task.review_id = task.review_id
                if task.finished_at:
                    try:
                        db_task.finished_at = datetime.fromisoformat(task.finished_at) if isinstance(task.finished_at, str) else datetime.utcnow()
                    except Exception:
                        db_task.finished_at = datetime.utcnow()
                db_task.error = task.error
                db_session.commit()
    except Exception as e:
        logger.error(f"Failed to persist manual task {task.task_id}: {e}")


async def resume_task(task_id: str, db: Session) -> TaskState:
    """
    Resume a failed/stopped task from its last checkpoint.
    Returns the TaskState (now running again).
    """
    async with _store_lock:
        if task_id in _active_runners:
            logger.warning(f"Task {task_id} is already running, ignoring resume request")
            return _task_store[task_id]

    task = get_task(task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")
    
    if task.status not in ("failed", "done", "running", "cancelled"):
        raise ValueError(f"Task {task_id} is in status '{task.status}', cannot resume")
    
    logger.info(f"🚀 Resuming task {task_id} (current status: {task.status})")
    
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
    # The runner's run method handles _active_runners registration
    asyncio.create_task(runner.run(resume_from=resume_from))
    
    return task


def cancel_task(task_id: str) -> TaskState:
    """
    Mark a task as cancelled.
    - If task exists in memory, updates immediate state for UI/SSE.
    - Always persists cancelled snapshot to DB for history consistency.
    """
    task = get_task(task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")

    now_iso = datetime.now().isoformat()
    task.status = "cancelled"
    task.error = "Cancelled by operator"
    task.finished_at = now_iso

    # Mark any running step as failed/cancelled message, keep done steps untouched
    for step in task.steps:
        if step.status == "running":
            step.status = "failed"
            step.finished_at = time.time()
            step.message = "已手动取消"

    try:
        task.event_queue.put_nowait({
            "event": "task_cancelled",
            "data": task.to_dict(),
        })
    except asyncio.QueueFull:
        pass

    # Persist to DB
    try:
        with SessionLocal() as db:
            db_task = db.query(PipelineTask).filter(PipelineTask.task_id == task_id).first()
            if db_task:
                db_task.status = "cancelled"
                db_task.error = task.error
                db_task.finished_at = datetime.fromisoformat(now_iso)
                db_task.state_data = task.to_dict()
                db.commit()
    except Exception as e:
        logger.error(f"Failed to persist cancelled task {task_id}: {e}")

    return task


# ────────────────────────────────────────────────────────────
# Retry helper
# ────────────────────────────────────────────────────────────

async def with_retry(coro_fn, max_attempts: int = 10, initial_delay: float = 3.0, step_log: Optional[StepLog] = None, task: Optional[TaskState] = None):
    """
    Run an async function with exponential backoff retry.
    Catches common Gemini API errors and retries up to max_attempts times.
    """
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        if task and task.status == "cancelled":
            raise asyncio.CancelledError("Task cancelled by operator")
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
            
            if task:
                task.add_log(f"API attempt {attempt} failed: {str(e)[:200]}. Retrying in {delay}s...")

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

    def _log(self, message: str):
        """Add a log entry and persist state immediately."""
        self.task.add_log(message)
        self._emit("log", {"message": message, "task_id": self.task.task_id})

    def _emit(self, event_type: str, data: Any):
        """Push an SSE event to the task's event queue and persist state."""
        try:
            self.task.event_queue.put_nowait({
                "event": event_type,
                "data": data,
            })
        except asyncio.QueueFull:
            pass  # drop if queue full
            
        # Update DB
        self._persist_task_state(self.task.status, self.task.to_dict())

    def _persist_task_state(self, status: str, snapshot: Dict[str, Any]):
        """Flush memory state to DB. synchronous inside the runner's caller (which is async-task)."""
        task_id = self.task.task_id
        topic = self.task.topic
        keywords = self.task.keywords
        finished_at = self.task.finished_at
        error = getattr(self.task, "error", None)
        review_id = self.task.review_id
        
        try:
            with SessionLocal() as db_session:
                db_task = db_session.query(PipelineTask).filter(PipelineTask.task_id == task_id).first()
                if db_task:
                    db_task.status = status
                    db_task.state_data = snapshot
                    db_task.keywords = keywords
                    if finished_at:
                        try:
                            if isinstance(finished_at, str):
                                db_task.finished_at = datetime.fromisoformat(finished_at)
                            else:
                                db_task.finished_at = datetime.utcfromtimestamp(finished_at)
                        except:
                            db_task.finished_at = datetime.utcnow()
                    db_task.error = error
                    db_task.review_id = review_id
                    db_session.commit()
        except Exception as e:
            logger.error(f"Save failed for task {task_id}: {e}")

    # Pipeline step ordering for resume logic
    STEP_ORDER = ["framework", "auto_search", "claims", "evidence", "render", "assemble"]

    def _save_checkpoint(self, step_key: str, data: Dict[str, Any] = None):
        """Save a checkpoint after a successful step."""
        self.task.last_completed_step = step_key
        if data:
            self.task.checkpoint_data[step_key] = data
        # Force a persist to DB
        self._persist_task_state(self.task.status, self.task.to_dict())

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

    def _raise_if_cancelled(self):
        if self.task.status == "cancelled":
            raise asyncio.CancelledError("Task cancelled by operator")

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
            # Ensure section_id and section_title are strings to avoid Pydantic validation errors
            raw_table = cp["evidence"]["claim_table"]
            if raw_table.get("section_id") is None:
                raw_table["section_id"] = "1"
            if raw_table.get("section_title") is None:
                raw_table["section_title"] = "Section 1"
            self._claim_table = SectionClaimTable.model_validate(raw_table)

        # Restore rendered sections (needed by step 6)
        if "render" in cp:
            self._rendered_sections = cp["render"].get("rendered_sections", [])
            self._all_citation_map = cp["render"].get("all_citation_map", {})
        
        logger.info(f"[Task {self.task.task_id}] Restored checkpoint up to step '{resume_from}'")

    async def run(self, resume_from: Optional[str] = None):
        """Main pipeline execution. If resume_from is set, skip steps before it."""
        task_id = self.task.task_id
        
        async with _store_lock:
            if task_id in _active_runners:
                logger.warning(f"Runner already active for task {task_id}")
                return
            _active_runners.add(task_id)

        try:
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
                self._raise_if_cancelled()
                if not self._should_skip("framework", resume_from):
                    await self._step_generate_framework()
                self._raise_if_cancelled()
                if not self._should_skip("auto_search", resume_from):
                    await self._step_auto_search()
                self._raise_if_cancelled()
                if not self._should_skip("claims", resume_from):
                    await self._step_generate_claims()
                self._raise_if_cancelled()
                if not self._should_skip("evidence", resume_from):
                    await self._step_attach_evidence()
                self._raise_if_cancelled()
                if not self._should_skip("render", resume_from):
                    await self._step_render_all()
                self._raise_if_cancelled()
                if not self._should_skip("assemble", resume_from):
                    await self._step_assemble()

                self.task.status = "done"
                self.task.finished_at = datetime.now().isoformat()
                self._emit("task_done", self.task.to_dict())
                logger.info(f"[Task {self.task.task_id}] Completed successfully")

            except asyncio.CancelledError:
                self.task.status = "cancelled"
                self.task.error = "Cancelled by operator"
                self.task.finished_at = datetime.now().isoformat()
                self._emit("task_cancelled", self.task.to_dict())
                logger.info(f"[Task {self.task.task_id}] Cancelled by operator")

            except Exception as e:
                self.task.status = "failed"
                self.task.error = str(e)
                self.task.finished_at = datetime.now().isoformat()
                self._emit("task_error", {"error": str(e), "task": self.task.to_dict()})
                logger.error(f"[Task {self.task.task_id}] Failed: {e}", exc_info=True)
                
        finally:
            async with _store_lock:
                if task_id in _active_runners:
                    _active_runners.remove(task_id)

    # ── Step 1: Generate Framework ──────────────────────────

    async def _step_generate_framework(self):
        from app.config import settings
        from app.services.llm.openai_service import OpenAIService
        from app.services.llm.prompts import ORCHESTRATE_FRAMEWORK_PROMPT, get_framework_system_prompt

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
                custom_instructions="Please ensure each section is detailed enough to warrant a 500-800 word academic discussion later.",
            )
            system_prompt = get_framework_system_prompt(self.db)
            raw = await llm.complete(prompt=prompt, system_prompt=system_prompt, temperature=0.3, max_tokens=2000)
            return raw

        try:
            self._log(f"Starting framework generation for topic: {self.task.topic}")
            raw = await with_retry(_call, max_attempts=5, step_log=step, task=self.task)
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
            self._log(f"Framework generated successfully with {sections_count} sections.")
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
        self._log(f"Starting automated paper search for {len(sections)} sections.")
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
                            page_size=min(self.task.papers_per_section, 200),
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

        self._log(f"Search results: {total_new} new papers found in retrieval stage.")
        self._step_done(step_key, f"检索完成：共获取约 {total_new} 篇新文献")

        # --- AI Relevance Filtering & Auto-Promotion ---
        if total_new > 0 or True:  # Always check if papers were found
            self._step_start(step_key, "AI 正在对获取的文献进行学科相关度审查 (AI Relevance Filter)...")

            if not job_ids:
                self._step_done(step_key, "检索完成：未产生爬虫任务")
                return

            from app.services.screening_service import screen_staging_papers

            async def _on_progress(scored: int, total_count: int, promoted: int):
                if scored % 5 == 0:
                    self._step_start(step_key, f"已审查 {scored}/{total_count} 篇文献，采纳 {promoted} 篇...")

            screening_result = await screen_staging_papers(
                db=self.db,
                topic=self.task.topic,
                crawl_job_ids=job_ids,
                auto_apply=True,
                on_progress=_on_progress,
            )

            # 将 promote 的论文提升到正式库
            accepted_papers = []
            for detail in screening_result.details:
                if detail.decision == "promote":
                    sp = self.db.query(StagingPaper).get(detail.staging_paper_id)
                    if sp:
                        source_paper = paper_to_source_paper(sp)
                        official_papers, _ = insert_or_update_papers_from_sources(self.db, [source_paper])
                        if official_papers:
                            self.task.paper_ids.append(official_papers[0].id)
                            accepted_papers.append(official_papers[0])
                        sp.status = "promoted"
                        self.db.commit()

            self._log(f"AI Review finished: Reviewed {screening_result.scored} papers, accepted {len(accepted_papers)} into library.")
            self._step_done(step_key, f"审查完成：总共发现 {screening_result.scored} 篇文献，AI 采纳了 {len(accepted_papers)} 篇符合课题方向的文献。")
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
            self._log(f"Generating claims for {len(self.task.framework.get('sections', []))} sections.")
            self._claim_table = await with_retry(_call, max_attempts=5, step_log=step, task=self.task)
            claims_count = len(self._claim_table.claims)
            self._log(f"Generated {claims_count} total claims.")
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
            self._log(f"Attaching evidence for {len(self._claim_table.claims)} claims...")
            self._claim_table = await with_retry(_call, max_attempts=5, step_log=step, task=self.task)
            papers_found = sum(len(c.support_papers or []) for c in self._claim_table.claims)
            self._log(f"Evidence attachment complete. Found {papers_found} references across claims.")
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
            # Fallback for section_id if it's missing or None
            sec_id = getattr(claim, "section_id", None) or "1"
            sections_map.setdefault(str(sec_id), []).append(claim)

        self._rendered_sections: List[Dict] = []
        self._all_citation_map: Dict = {}
        total_sections = max(len(sections_map), 1)

        llm = OpenAIService(settings=settings)
        sem = get_semantic_search_service()
        pipeline = SectionReviewPipelineService(db=self.db, llm_service=llm, semantic_search_service=sem)

        prev_summary = ""
        section_items = list(sections_map.items())

        import re as _re
        def _is_discussion(title: str) -> bool:
            return bool(_re.search(r'讨论|总结|结论|展望|discussion|conclusion|future|summary', title, _re.IGNORECASE))

        for i, (sec_id, claims) in enumerate(section_items):
            if step:
                step.message = f"渲染第 {i+1}/{total_sections} 节..."
            self._emit("step_update", self.task.to_dict())

            sec_title = getattr(claims[0], "section_title", None) or f"Section {i+1}"
            mini_table = SectionClaimTable(
                section_id=str(sec_id),
                section_title=str(sec_title),
                claims=claims,
            )

            # 讨论/结论章节或最后一章：传全文各章节汇总
            is_last = (i == len(section_items) - 1)
            is_disc = _is_discussion(str(sec_title))
            all_summary = None
            if (is_disc or is_last) and self._rendered_sections:
                all_summary = "\n\n".join(
                    f"【{s['section_title']}】{s['text'][:300]}..."
                    for s in self._rendered_sections
                )

            _prev = prev_summary or None
            _all = all_summary

            async def _call(tbl=mini_table, ps=_prev, als=_all):
                return await pipeline.render_section_from_claims(
                    table=tbl,
                    language=self.task.language,
                    review_id=self.task.review_id,
                    previous_sections_summary=ps,
                    all_sections_summary=als,
                )

            try:
                self._log(f"Rendering section {i+1}/{total_sections}: {sec_title}")
                rendered = await with_retry(_call, max_attempts=5, step_log=step, task=self.task)
                self._rendered_sections.append({
                    "section_id": sec_id,
                    "section_title": sec_title,
                    "text": rendered.text,
                    "citation_map": rendered.citation_map or {},
                })
                self._all_citation_map.update(rendered.citation_map or {})
                # 累积前文摘要
                prev_summary += f"【{sec_title}】{rendered.text[:200]}...\n"
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
        from app.services.llm.prompts import (
            GENERATE_ABSTRACT_PROMPT_ZH, GENERATE_ABSTRACT_PROMPT_EN,
            GENERATE_CONCLUSION_PROMPT_ZH, GENERATE_CONCLUSION_PROMPT_EN,
        )
        from app.services.document_composer import compose_full_document

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

        # ── 6a: Assemble body text (for LLM context) ──
        body_lines = []
        for sec in self._rendered_sections:
            body_lines.append(f"## {sec['section_title']}\n")
            body_lines.append(sec.get("text", ""))
        body_md = "\n".join(body_lines)

        # ── 6b: Generate Abstract ──
        step = self.task.get_step(step_key)
        if step:
            step.message = "正在生成摘要 (Abstract)..."
        self._emit("step_update", self.task.to_dict())

        abstract_text = ""
        try:
            from app.services.llm.openai_service import OpenAIService
            from app.config import settings
            llm = OpenAIService(settings=settings)

            truncated_body = body_md[:8000] if len(body_md) > 8000 else body_md
            if self.task.language.lower().startswith("en"):
                abs_prompt = GENERATE_ABSTRACT_PROMPT_EN.format(review_content=truncated_body)
            else:
                abs_prompt = GENERATE_ABSTRACT_PROMPT_ZH.format(review_content=truncated_body)

            abstract_text = await with_retry(
                lambda: llm.complete(
                    prompt=abs_prompt,
                    system_prompt="You are an expert academic writer specializing in concise, high-quality abstracts.",
                    temperature=0.3, max_tokens=1000,
                ),
                max_attempts=3, step_log=step, task=self.task,
            )
            abstract_text = abstract_text.strip()
            self._log(f"Abstract generated: {len(abstract_text)} chars")
        except Exception as e:
            logger.warning(f"[Task {self.task.task_id}] Abstract generation failed: {e}")
            self._log(f"Abstract generation failed (non-fatal): {e}")

        # ── 6c: Generate Conclusion ──
        if step:
            step.message = "正在生成结论 (Conclusion)..."
        self._emit("step_update", self.task.to_dict())

        conclusion_text = ""
        try:
            truncated_body_c = body_md[:10000] if len(body_md) > 10000 else body_md
            if self.task.language.lower().startswith("en"):
                conc_prompt = GENERATE_CONCLUSION_PROMPT_EN.format(review_content=truncated_body_c)
            else:
                conc_prompt = GENERATE_CONCLUSION_PROMPT_ZH.format(review_content=truncated_body_c)

            conclusion_text = await with_retry(
                lambda: llm.complete(
                    prompt=conc_prompt,
                    system_prompt="You are an expert academic writer specializing in comprehensive, forward-looking conclusions.",
                    temperature=0.4, max_tokens=2000,
                ),
                max_attempts=3, step_log=step, task=self.task,
            )
            conclusion_text = conclusion_text.strip()
            self._log(f"Conclusion generated: {len(conclusion_text)} chars")
        except Exception as e:
            logger.warning(f"[Task {self.task.task_id}] Conclusion generation failed: {e}")
            self._log(f"Conclusion generation failed (non-fatal): {e}")

        # ── 6d: Assemble final markdown ──
        if step:
            step.message = "正在组装最终文档..."
        self._emit("step_update", self.task.to_dict())

        md_lines = [f"# {title}\n"]

        # Abstract
        if abstract_text:
            md_lines.append("\n## Abstract\n")
            md_lines.append(abstract_text)

        # Body sections
        for sec in self._rendered_sections:
            md_lines.append(f"\n## {sec['section_title']}\n")
            md_lines.append(sec.get("text", ""))

        # Conclusion
        if conclusion_text:
            md_lines.append("\n## Conclusion\n")
            md_lines.append(conclusion_text)

        # References
        md_lines.append(f"\n## References\n")
        md_lines.append(refs_md)
        full_md = "\n".join(md_lines)

        # ── 6e: Build claim→papers mapping for analysis_json (Task 3.1) ──
        claims_evidence_map = {}
        if hasattr(self, "_claim_table") and self._claim_table:
            for claim in self._claim_table.claims:
                claim_text = getattr(claim, "claim", None) or getattr(claim, "text", "unknown")
                support = getattr(claim, "support_papers", None) or []
                claims_evidence_map[claim_text[:120]] = {
                    "section_id": getattr(claim, "section_id", None),
                    "section_title": getattr(claim, "section_title", None),
                    "supporting_paper_ids": [
                        sp.get("paper_id") if isinstance(sp, dict) else getattr(sp, "paper_id", None)
                        for sp in support
                    ],
                    "evidence_count": len(support),
                }

        # ── 6f: Build references_json (structured) ──
        references_json_data = None
        try:
            ref_items = []
            # Build citation_map for inline key lookup
            citation_map = ref_formatter.build_citation_map(cited_papers, style=style_enum)
            for idx, paper in enumerate(cited_papers):
                formatted = ref_formatter.format_one(paper, style=style_enum)
                inline_key = ref_formatter.make_inline_citation(paper, style=style_enum)
                ref_items.append({
                    "paper_id": paper.id,
                    "order_index": idx,
                    "citation_key": inline_key,
                    "formatted": formatted,
                    "raw": {
                        "title": paper.title,
                        "authors": paper.authors or [],
                        "year": paper.year,
                        "journal": paper.journal,
                        "doi": paper.doi,
                    },
                })
            references_json_data = {
                "style": style_enum.value,
                "items": ref_items,
            }
        except Exception as e:
            logger.warning(f"[Task {self.task.task_id}] Failed to build references_json: {e}")

        # ── 6g: Save to DB ──
        if self.task.review_id:
            from app.models.review import ReviewPaper
            review = self.db.query(Review).filter(Review.id == self.task.review_id).first()
            if review:
                # ── Write independent fields (Single Source of Truth) ──
                review.abstract = abstract_text or None
                review.conclusion = conclusion_text or None
                review.references_json = references_json_data
                review.paper_count = len(cited_papers)

                # ── Save analysis_json (backward compat + claim→evidence mapping) ──
                existing_analysis = review.analysis_json or {}
                if isinstance(existing_analysis, str):
                    try:
                        existing_analysis = json.loads(existing_analysis)
                    except Exception:
                        existing_analysis = {}
                existing_analysis["citation_map"] = self._all_citation_map
                existing_analysis["conclusion"] = conclusion_text or None  # backward compat
                existing_analysis["references_markdown"] = refs_md  # backward compat
                existing_analysis["claims_evidence"] = claims_evidence_map
                existing_analysis["stats"] = {
                    "total_cited_papers": len(cited_papers),
                    "total_sections": len(self._rendered_sections),
                    "abstract_length": len(abstract_text),
                    "conclusion_length": len(conclusion_text),
                }
                review.analysis_json = existing_analysis

                # ── Compose full document via composer (content = assembled cache) ──
                review.content = body_md  # Temporarily store body for composer extraction
                full_md = compose_full_document(review)
                review.content = full_md
                review.word_count = len(full_md)

                # ── Link cited papers ──
                # 1. Clear existing links to avoid duplicates on resume
                self.db.query(ReviewPaper).filter(ReviewPaper.review_id == review.id).delete()

                # 2. Add new links
                for i, paper in enumerate(cited_papers):
                    rp = ReviewPaper(
                        review_id=review.id,
                        paper_id=paper.id,
                        order_index=i
                    )
                    self.db.add(rp)

                self.db.commit()

        self.task.full_markdown = full_md
        self.task.references_markdown = refs_md
        self.task.total_cited_papers = len(cited_papers)

        self._step_done(step_key, f"综述组装完成！含 Abstract + Conclusion，共引用 {len(cited_papers)} 篇文献。")
