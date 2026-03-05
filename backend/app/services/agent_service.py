"""
AI Agent 服务 — 自然语言驱动的文献综述系统操作

采用 tool-use 模式：
1. LLM 分析用户意图，选择合适的工具
2. 后端执行对应操作
3. LLM 将结果用自然语言总结反馈
"""
import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.config import settings
from app.models.paper import Paper
from app.models.staging_paper import StagingPaper
from app.services.llm.openai_service import OpenAIService

logger = logging.getLogger(__name__)

# ── 工具定义 ────────────────────────────────────────────

TOOLS_SCHEMA = [
    {
        "name": "search_papers",
        "description": "在 Semantic Scholar / arXiv / CrossRef 等数据源上搜索文献并加入暂存库",
        "parameters": {
            "keywords": "搜索关键词，用逗号分隔",
            "sources": "数据源列表，可选 arxiv/crossref/semantic_scholar",
            "max_results": "最大结果数（默认 50）",
        },
    },
    {
        "name": "list_staging",
        "description": "查看暂存库中的文献列表",
        "parameters": {
            "q": "可选的搜索关键词",
            "status": "状态过滤: pending/accepted/rejected",
            "page_size": "每页数量（默认 10）",
        },
    },
    {
        "name": "promote_papers",
        "description": "将暂存库中的文献提升为正式库文献",
        "parameters": {
            "filter_q": "可选：按关键词过滤要提升的文献",
            "status": "可选：按状态过滤（默认 pending）",
            "limit": "最多提升数量（默认全部）",
        },
    },
    {
        "name": "delete_staging",
        "description": "删除暂存库中不需要的文献",
        "parameters": {
            "filter_q": "可选：按关键词过滤要删除的文献",
            "year_before": "可选：删除某年份之前的文献",
        },
    },
    {
        "name": "search_library",
        "description": "在正式文献库中搜索已入库的文献",
        "parameters": {
            "q": "搜索关键词",
            "page_size": "每页数量（默认 10）",
        },
    },
    {
        "name": "sync_citations",
        "description": "为正式库中的文献同步引用关系（从 Crossref 获取）",
        "parameters": {
            "paper_ids": "文献 ID 列表，留空则同步全部",
        },
    },
    {
        "name": "system_status",
        "description": "查看系统当前状态：有多少文献、暂存文献、配置信息等",
        "parameters": {},
    },
    {
        "name": "general_chat",
        "description": "通用对话 — 回答关于学术概念、方法论等知识性问题",
        "parameters": {
            "topic": "对话主题",
        },
    },
]

TOOLS_DESCRIPTION = "\n".join(
    f"- **{t['name']}**: {t['description']}" for t in TOOLS_SCHEMA
)

INTENT_SYSTEM_PROMPT = f"""你是一个文献综述系统的 AI 助手。用户会用自然语言告诉你想做什么。

你需要分析用户的意图，选择最合适的工具来执行操作。

可用工具：
{TOOLS_DESCRIPTION}

请以 JSON 格式回复，包含以下字段：
- "tool": 工具名称（必须是上面列出的工具之一）
- "params": 工具参数（字典）
- "reasoning": 简短说明你为什么选择这个工具（中文）

只输出 JSON，不要有其他文字。"""


SUMMARY_SYSTEM_PROMPT = """你是一个文献综述系统的 AI 助手。请根据操作结果，用友好、简洁的中文向用户反馈。

要求：
1. 先简述执行了什么操作
2. 列出关键数据（如：找到 X 篇论文、提升了 Y 篇）
3. 如果有有趣的发现（如某篇高引论文），可以提一下
4. 如果操作失败，分析可能的原因并给出建议
5. 保持亲切自然的语气，可以适当使用 emoji"""


class AgentService:
    """AI Agent 服务"""

    def __init__(self):
        self.llm = OpenAIService(settings=settings)

    async def chat(
        self,
        message: str,
        history: List[Dict[str, str]],
        db: Session,
        mode: str = "agent",
    ) -> Dict[str, Any]:
        """
        处理用户对话消息。

        Args:
            mode: "ask" = 纯问答（跳过工具调用）, "agent" = 完整 Agent 模式

        Returns:
            {
                "reply": str,         # AI 回复文本
                "action": {           # 如果执行了操作
                    "tool": str,      # 工具名
                    "params": dict,   # 参数
                    "result": dict,   # 执行结果
                } | None,
            }
        """
        # ── Ask 模式：纯问答，不执行任何系统操作 ──
        if mode == "ask":
            return await self._ask_mode(message, history)

        # ── Agent 模式：意图识别 → 工具执行 → 结果总结 ──

        # Step 1: 意图识别
        try:
            intent = await self._identify_intent(message, history)
        except Exception as e:
            logger.exception("Agent 意图识别失败")
            return {
                "reply": f"抱歉，我理解你的指令时遇到了问题：{e}\n请换个说法试试？",
                "action": None,
            }

        tool = intent.get("tool", "general_chat")
        params = intent.get("params", {})
        reasoning = intent.get("reasoning", "")

        logger.info("[Agent] tool=%s params=%s reasoning=%s", tool, params, reasoning)

        # Step 2: 执行工具
        try:
            result = await self._execute_tool(tool, params, db)
        except Exception as e:
            logger.exception("Agent 工具执行失败: tool=%s", tool)
            return {
                "reply": f"执行操作时出错了 😥\n工具: {tool}\n错误: {e}",
                "action": {"tool": tool, "params": params, "result": {"error": str(e)}},
            }

        # Step 3: 用 LLM 总结结果
        try:
            summary = await self._summarize_result(message, tool, params, result)
        except Exception:
            logger.exception("Agent 结果总结失败")
            summary = f"操作已完成。结果：{json.dumps(result, ensure_ascii=False, default=str)[:500]}"

        return {
            "reply": summary,
            "action": {"tool": tool, "params": params, "result": result},
        }

    # ── Ask 模式 ──────────────────────────────────────

    async def _ask_mode(
        self, message: str, history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """纯问答模式：直接用 LLM 回答，不执行任何系统操作"""
        history_text = ""
        if history:
            recent = history[-6:]
            history_text = "\n".join(
                f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content'][:300]}"
                for m in recent
            )

        prompt = message
        if history_text:
            prompt = f"对话历史：\n{history_text}\n\n用户最新提问：\n{message}"

        try:
            reply = await self.llm.complete(
                prompt=prompt,
                system_prompt=(
                    "你是一个专业的学术研究助手。用户会就学术概念、研究方法、"
                    "文献综述写作等问题向你提问。\n\n"
                    "要求：\n"
                    "1. 用中文回答，语言简洁专业\n"
                    "2. 如果涉及具体理论或概念，引用相关学者和文献\n"
                    "3. 可以使用 markdown 格式（加粗、列表等）来组织回答\n"
                    "4. 保持亲切自然的语气"
                ),
                temperature=0.7,
                max_tokens=2000,
            )
        except Exception as e:
            logger.exception("Ask 模式 LLM 调用失败")
            reply = f"抱歉，回答时遇到了问题：{e}"

        return {"reply": reply, "action": None}

    # ── 意图识别 ──────────────────────────────────────

    async def _identify_intent(
        self, message: str, history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        history_text = ""
        if history:
            recent = history[-6:]  # 最近 3 轮对话
            history_text = "\n".join(
                f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content'][:200]}"
                for m in recent
            )

        prompt = f"""对话历史：
{history_text}

用户最新消息：
{message}

请分析用户意图并选择合适的工具。输出 JSON。"""

        raw = await self.llm.complete(
            prompt=prompt,
            system_prompt=INTENT_SYSTEM_PROMPT,
            temperature=0.1,
            max_tokens=500,
        )

        # 解析 JSON（鲁棒处理 LLM 各种输出格式）
        import re as _re
        text = raw.strip()

        # 去除 markdown 代码块包裹（```json ... ``` 或 ``` ... ```）
        code_block = _re.search(r'```(?:json)?\s*\n?(.*?)```', text, _re.DOTALL)
        if code_block:
            text = code_block.group(1).strip()
        
        # 尝试直接提取 JSON 对象
        json_match = _re.search(r'\{.*\}', text, _re.DOTALL)
        if json_match:
            text = json_match.group(0)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # 尝试修复常见问题：去除尾部逗号
            fixed = _re.sub(r',\s*}', '}', text)
            fixed = _re.sub(r',\s*]', ']', fixed)
            try:
                return json.loads(fixed)
            except json.JSONDecodeError:
                logger.warning("无法解析 LLM 意图 JSON，原始输出: %s", raw[:500])
                # 回退到通用对话，避免完全崩溃
                return {"tool": "general_chat", "params": {}, "reasoning": "JSON 解析失败，回退到通用对话"}

    # ── 工具执行 ──────────────────────────────────────

    async def _execute_tool(
        self, tool: str, params: Dict, db: Session
    ) -> Dict[str, Any]:
        handlers = {
            "search_papers": self._tool_search_papers,
            "list_staging": self._tool_list_staging,
            "promote_papers": self._tool_promote_papers,
            "delete_staging": self._tool_delete_staging,
            "search_library": self._tool_search_library,
            "sync_citations": self._tool_sync_citations,
            "system_status": self._tool_system_status,
            "general_chat": self._tool_general_chat,
        }

        handler = handlers.get(tool)
        if handler is None:
            return {"error": f"未知工具: {tool}"}

        return await handler(params, db)

    # ── 具体工具实现 ──────────────────────────────────

    async def _tool_search_papers(self, params: Dict, db: Session) -> Dict:
        """搜索文献并创建爬取任务"""
        from app.services.crawl_service import create_crawl_job, run_crawl_job_once
        from app.schemas import CrawlJobCreate

        import re

        # 兼容 LLM 返回不同的参数名（keywords / query / keyword / q / search）
        keywords_raw = (
            params.get("keywords")
            or params.get("query")
            or params.get("keyword")
            or params.get("q")
            or params.get("search")
            or ""
        )
        if isinstance(keywords_raw, list):
            keywords = [str(k).strip() for k in keywords_raw if str(k).strip()]
        else:
            # 同时支持中英文逗号分隔
            keywords = [k.strip() for k in re.split(r'[,，]', str(keywords_raw)) if k.strip()]
        if not keywords:
            return {"error": "请提供搜索关键词"}

        sources = params.get("sources", "semantic_scholar")
        if isinstance(sources, str):
            sources = [s.strip() for s in re.split(r'[,，]', sources) if s.strip()]
        elif isinstance(sources, list):
            sources = [str(s).strip() for s in sources if str(s).strip()]

        max_results = int(params.get("max_results", 50))

        # 构建 CrawlJobCreate pydantic 对象
        payload = CrawlJobCreate(
            keywords=keywords,
            sources=sources,
            max_results=max_results,
            page_size=min(max_results, 50),
            year_from=params.get("year_from"),
            year_to=params.get("year_to"),
        )

        # 创建爬取任务
        job = create_crawl_job(db=db, payload=payload)

        # 执行一批
        job, new_count = run_crawl_job_once(db, job.id)

        return {
            "job_id": job.id,
            "keywords": keywords,
            "sources": sources,
            "status": job.status,
            "fetched_count": job.fetched_count or 0,
            "new_papers": new_count,
        }

    async def _tool_list_staging(self, params: Dict, db: Session) -> Dict:
        """查看暂存库"""
        query = db.query(StagingPaper)

        q = params.get("q")
        if q and q.strip():
            pattern = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    StagingPaper.title.ilike(pattern),
                    StagingPaper.abstract.ilike(pattern),
                )
            )

        status = params.get("status")
        if status:
            query = query.filter(StagingPaper.status == status)

        total = query.count()
        page_size = int(params.get("page_size", 10))
        papers = (
            query.order_by(StagingPaper.year.desc().nullslast(), StagingPaper.id.desc())
            .limit(page_size)
            .all()
        )

        items = []
        for p in papers:
            items.append({
                "id": p.id,
                "title": p.title,
                "year": p.year,
                "source": p.source,
                "status": p.status,
                "doi": p.doi,
            })

        return {"total": total, "shown": len(items), "items": items}

    async def _tool_promote_papers(self, params: Dict, db: Session) -> Dict:
        """提升暂存文献"""
        from app.services.paper_service import promote_staging_papers

        query = db.query(StagingPaper)
        status = params.get("status", "pending")
        if status:
            query = query.filter(StagingPaper.status == status)

        filter_q = params.get("filter_q")
        if filter_q and filter_q.strip():
            pattern = f"%{filter_q.strip()}%"
            query = query.filter(StagingPaper.title.ilike(pattern))

        limit = params.get("limit")
        if limit:
            query = query.limit(int(limit))

        records = query.all()
        if not records:
            return {"promoted": 0, "message": "没有找到符合条件的暂存文献"}

        promoted = await promote_staging_papers(db, records)
        return {"promoted": len(promoted), "titles": [p.title[:60] for p in promoted[:5]]}

    async def _tool_delete_staging(self, params: Dict, db: Session) -> Dict:
        """删除暂存文献"""
        query = db.query(StagingPaper)

        filter_q = params.get("filter_q")
        if filter_q and filter_q.strip():
            pattern = f"%{filter_q.strip()}%"
            query = query.filter(StagingPaper.title.ilike(pattern))

        year_before = params.get("year_before")
        if year_before:
            query = query.filter(StagingPaper.year < int(year_before))

        count = query.delete(synchronize_session="fetch")
        db.commit()
        return {"deleted": count}

    async def _tool_search_library(self, params: Dict, db: Session) -> Dict:
        """搜索正式库"""
        query = db.query(Paper)

        q = params.get("q")
        if q and q.strip():
            pattern = f"%{q.strip()}%"
            query = query.filter(
                or_(Paper.title.ilike(pattern), Paper.abstract.ilike(pattern))
            )

        total = query.count()
        page_size = int(params.get("page_size", 10))
        papers = (
            query.order_by(Paper.year.desc().nullslast(), Paper.id.desc())
            .limit(page_size)
            .all()
        )

        items = []
        for p in papers:
            items.append({
                "id": p.id,
                "title": p.title,
                "year": p.year,
                "source": p.source,
                "doi": p.doi,
                "citations_count": p.citations_count,
            })

        return {"total": total, "shown": len(items), "items": items}

    async def _tool_sync_citations(self, params: Dict, db: Session) -> Dict:
        """同步引用关系"""
        from app.services.citation_ingest import get_citation_ingest_service

        service = get_citation_ingest_service()
        paper_ids = params.get("paper_ids")

        if paper_ids and isinstance(paper_ids, list):
            ids = [int(pid) for pid in paper_ids]
        else:
            # 同步全部有 DOI 的论文
            papers = db.query(Paper.id).filter(Paper.doi.isnot(None)).all()
            ids = [p.id for p in papers]

        if not ids:
            return {"processed": 0, "message": "没有找到有 DOI 的论文"}

        # 限制数量避免超时
        ids = ids[:20]
        stats = await service.sync_citations_batch(db=db, paper_ids=ids)
        return stats

    async def _tool_system_status(self, params: Dict, db: Session) -> Dict:
        """系统状态"""
        total_papers = db.query(Paper).count()
        total_staging = db.query(StagingPaper).count()
        pending_staging = (
            db.query(StagingPaper).filter(StagingPaper.status == "pending").count()
        )

        return {
            "total_papers": total_papers,
            "total_staging": total_staging,
            "pending_staging": pending_staging,
            "llm_model": settings.OPENAI_MODEL,
            "embedding_model": settings.EMBEDDING_MODEL,
            "semantic_scholar_enabled": settings.SEMANTIC_SCHOLAR_ENABLED,
            "serpapi_enabled": settings.SERPAPI_SCHOLAR_ENABLED,
        }

    async def _tool_general_chat(self, params: Dict, db: Session) -> Dict:
        """通用对话 — 直接返回空结果，让总结步骤用 LLM 回答"""
        return {"type": "general_chat"}

    # ── 结果总结 ──────────────────────────────────────

    async def _summarize_result(
        self,
        user_message: str,
        tool: str,
        params: Dict,
        result: Dict,
    ) -> str:
        if tool == "general_chat":
            # 通用对话直接用 LLM 回答
            return await self.llm.complete(
                prompt=user_message,
                system_prompt="你是一个学术研究助手，请用中文简洁回答用户的问题。",
                temperature=0.7,
                max_tokens=2000,
            )

        result_text = json.dumps(result, ensure_ascii=False, default=str)[:2000]
        prompt = f"""用户指令：{user_message}
执行的工具：{tool}
工具参数：{json.dumps(params, ensure_ascii=False)}
执行结果：{result_text}

请用友好的中文总结这次操作的结果。"""

        return await self.llm.complete(
            prompt=prompt,
            system_prompt=SUMMARY_SYSTEM_PROMPT,
            temperature=0.5,
            max_tokens=1000,
        )


# 单例
_agent_service: Optional[AgentService] = None


def get_agent_service() -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService()
    return _agent_service
