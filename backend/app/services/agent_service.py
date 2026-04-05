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
from app.models.group import PaperGroup, PaperGroupAssociation
from app.services.llm.openai_service import OpenAIService
from app.api.settings import get_custom_system_prompt

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
        "description": "General conversation - answer knowledge questions about academic concepts, methods, etc.",
        "parameters": {
            "topic": "conversation topic",
        },
    },
    {
        "name": "generate_framework",
        "description": "Generate a structured literature review framework/outline from a research topic",
        "parameters": {
            "topic": "Research topic (required)",
            "keywords": "Comma-separated keywords",
            "language": "Language: zh-CN or en (default zh-CN)",
        },
    },
    {
        "name": "start_review_task",
        "description": "启动异步完整文献综述生成任务（即 'PHD管线'、'一键综述'）。返回任务 ID，进度在侧边栏『PhD深度管线』中可见。这是执行深度综述、PhD 级长管线任务的最佳选择。",
        "parameters": {
            "topic": "研究课题/综述题目 (必须)",
            "keywords": "逗号分隔的关键词",
            "papers_per_section": "每个章节参考的文献数 (默认 20)",
            "citation_style": "引用格式: harvard/apa/ieee/chicago/vancouver (默认 harvard)",
        },
    },
    {
        "name": "run_phd_pipeline",
        "description": "执行 PhD 多阶段综述管线的特定阶段（生成论点、关联证据、渲染章节）。",
        "parameters": {
            "keywords": "研究关键词 (如果 review_id 为空则必须)",
            "review_id": "现有综述 ID，用于继续之前的任务",
            "stage": "管线阶段: init (初始化)/evidence (关联证据)/render (渲染) (默认 init)",
        },
    },
    {
        "name": "list_reviews",
        "description": "List all generated literature reviews",
        "parameters": {
            "limit": "Max number to show (default 10)",
        },
    },
    {
        "name": "export_review",
        "description": "Export a review to Markdown format",
        "parameters": {
            "review_id": "The review ID to export (required)",
        },
    },
    {
        "name": "semantic_search",
        "description": "Perform semantic/vector search across the paper library using natural language queries",
        "parameters": {
            "query": "Natural language search query (required)",
            "top_k": "Number of results (default 5)",
        },
    },
    {
        "name": "manage_groups",
        "description": "Manage paper groups: list groups, create group, add/remove papers from groups",
        "parameters": {
            "action": "Action: list/create/add_papers/remove_papers",
            "group_name": "Group name (for create)",
            "group_id": "Group ID (for add/remove)",
            "paper_ids": "Paper IDs to add/remove (list)",
        },
    },
    {
        "name": "check_task_progress",
        "description": "查看指定的 pHd 管线的执行进度和详细日志。可以回答：『任务 9dc93b80 现在的进度如何？』、『它在具体搜什么词？』",
        "parameters": {
            "task_id": "任务 ID (8位 16进制字符串，必填)",
        },
    },
    {
        "name": "modify_task_requirements",
        "description": "在 PHd 管线运行期间动态修改或补充需求。比如添加新的关键词、调整搜索重点。系统会自动为正在进行的任务补充检索任务。",
        "parameters": {
            "task_id": "任务 ID (必填)",
            "additional_keywords": "要补充的关键词列表 (逗号分隔)",
            "new_topic": "可选：修改该任务的研究课题",
        },
    },
    {
        "name": "configure_discipline",
        "description": "配置/切换综述系统的学科身份。用户可以用自然语言描述自己的学科方向，AI 会自动生成完整的学科配置（包括 LLM 身份、提示词模板等）并保存。例如：'把系统配置成建筑学方向'、'我是做计算机视觉的'。",
        "parameters": {
            "description": "用户对学科方向的自然语言描述（必填）",
            "preset_name": "可选：同时保存为命名预设",
        },
    },
    {
        "name": "download_pdf",
        "description": "下载指定文献的 PDF 全文。支持直接下载（OA/arXiv）、Unpaywall 开放获取、机构认证下载三种策略。也可以批量下载多篇文献。",
        "parameters": {
            "paper_ids": "文献 ID 列表（必填，可以是单个 ID 或多个）",
        },
    },
    {
        "name": "screen_papers",
        "description": "对暂存库中的文献进行 AI 自动筛选评分。LLM 根据研究主题评估每篇文献的相关性（0-10 分），高分自动纳入、低分自动排除。支持 PRISMA 四阶段筛选流程。",
        "parameters": {
            "topic": "研究主题/课题（必填，用于评估相关性）",
            "crawl_job_id": "可选：只筛选特定爬取任务的文献",
            "keywords": "可选：额外的关键词过滤",
        },
    },
    {
        "name": "enrich_papers",
        "description": "为文献库中的论文补全缺失的元数据（摘要、期刊信息、影响因子、JCR 分区、收录平台等）。从 CrossRef 和 Semantic Scholar 获取。",
        "parameters": {
            "paper_ids": "文献 ID 列表，留空则自动选择缺失信息的文献",
            "limit": "最多处理数量（默认 20）",
        },
    },
    {
        "name": "prisma_stage",
        "description": "管理 PRISMA 筛选阶段。将暂存文献在四个阶段间推进：identification → screening → eligibility → included。可以查看各阶段统计或批量推进。",
        "parameters": {
            "action": "操作: stats（查看统计）/ advance（推进阶段）/ set（设置阶段）",
            "staging_paper_ids": "文献 ID 列表（advance/set 时必填）",
            "target_stage": "目标阶段: screening/eligibility/included（advance/set 时必填）",
            "exclusion_reason": "可选：排除原因（设为非 included 阶段时）",
        },
    },
    {
        "name": "institutional_login",
        "description": "登录大学机构访问（EZProxy / Shibboleth），获取认证 session 用于下载付费期刊 PDF 或访问 Web of Science。",
        "parameters": {},
    },
]

TOOLS_DESCRIPTION = "\n".join(
    f"- **{t['name']}**: {t['description']}" for t in TOOLS_SCHEMA
)

INTENT_SYSTEM_PROMPT = f"""你是一个文献综述系统的 AI 助手。用户会用自然语言告诉你想做什么。

### 核心原则：
1. **优先系统功能**：当用户提到“PHD管线”、“综述”、“搜索文献”、“入库”、“分组”等词汇时，必须优先匹配系统内置工具。**严禁**将其解释为通用的科学概念（如生物模型、通用科研阶段）。
2. **术语深度关联**：
   - “PHD管线”、“一键生成”、“深度综述”、“走一遍管线” -> **必须**对应工具 `start_review_task`。
   - “总结现状”、“调研题目”、“去搜一下” -> 对应工具 `search_papers`。
   - “提升”、“通过”、“入库”、“转正式” -> 对应工具 `promote_papers`。
3. **上下文感知**：如果用户说“去做”、“按这个生成”、“用管线跑一下”，但没提供课题名，你应该从“对话历史”中提取之前的研究课题作为 `topic` 参数。

可用工具：
{TOOLS_DESCRIPTION}

### 输出格式：
必须只输出一个 JSON 对象，包含：
- "tool": 工具名称
- "params": 参数字典
- "reasoning": 为什么匹配到这个工具（中文）

### 示例：
用户：“搜一下城市设计中的人工智能”
回复：{{"tool": "search_papers", "params": {{"keywords": "人工智能, 城市设计"}}, "reasoning": "用户请求搜索特定领域的文献"}}

用户：“用PHD管线去做这个课题” (历史提到过 TOD 项目)
回复：{{"tool": "start_review_task", "params": {{"topic": "TOD综合评估模型"}}, "reasoning": "用户明确要求使用PHD管线，从历史中提取研究课题"}}

只输出 JSON，严禁任何解释性文字。"""


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

    def _build_system_prompt(self, base_prompt: str, db: Session) -> str:
        """在基础 system prompt 前拼接用户自定义提示词"""
        custom = get_custom_system_prompt(db)
        if custom and custom.strip():
            return f"{custom.strip()}\n\n---\n\n{base_prompt}"
        return base_prompt

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
            return await self._ask_mode(message, history, db)

        # ── Agent 模式：意图识别 → 工具执行 → 结果总结 ──

        # Step 1: 意图识别
        try:
            intent = await self._identify_intent(message, history, db)
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
            summary = await self._summarize_result(message, tool, params, result, db)
        except Exception:
            logger.exception("Agent 结果总结失败")
            summary = f"操作已完成。结果：{json.dumps(result, ensure_ascii=False, default=str)[:500]}"

        return {
            "reply": summary,
            "action": {"tool": tool, "params": params, "result": result},
        }

    # ── Ask 模式 ──────────────────────────────────────

    async def _ask_mode(
        self, message: str, history: List[Dict[str, str]], db: Session
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
                system_prompt=self._build_system_prompt(
                    "你是一个专业的学术研究助手。用户会就学术概念、研究方法、"
                    "文献综述写作等问题向你提问。\n\n"
                    "要求：\n"
                    "1. 用中文回答，语言简洁专业\n"
                    "2. 如果涉及具体理论或概念，引用相关学者和文献\n"
                    "3. 可以使用 markdown 格式（加粗、列表等）来组织回答\n"
                    "4. 保持亲切自然的语气",
                    db,
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
        self, message: str, history: List[Dict[str, str]], db: Session
    ) -> Dict[str, Any]:
        """识别用户意图。结合启发式规则和 LLM。"""
        msg_lower = message.lower()
        
        # ── 启发式规则 (Heuristic Safety Net) ──
        # 有些词汇是 100% 对应某个工具的，直接拦截避免 LLM 幻觉
        if any(w in msg_lower for w in ["暂存库", "暂存文献"]):
            return {
                "tool": "list_staging", 
                "params": {}, 
                "reasoning": "启发式规则拦截：提到暂存库。"
            }

        # ── LLM 意图识别 ──
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

        import asyncio as _asyncio

        async def _call_llm():
            return await self.llm.complete(
                prompt=prompt,
                system_prompt=self._build_system_prompt(INTENT_SYSTEM_PROMPT, db),
                temperature=0.1,
                max_tokens=500,
            )

        # Retry with exponential backoff for Gemini API
        last_err = None
        for attempt in range(1, 6):
            try:
                raw = await _call_llm()
                break
            except Exception as e:
                last_err = e
                err_str = str(e).lower()
                is_retriable = any(w in err_str for w in [
                    "rate limit", "429", "timeout", "503", "overloaded",
                    "resource_exhausted", "high demand", "spikes in demand",
                    "experiencing", "500", "502", "capacity",
                ])
                if not is_retriable or attempt == 5:
                    raise
                delay = 3.0 * (2 ** (attempt - 1))
                logger.warning(f"[Agent] LLM intent call failed (attempt {attempt}/5): {e}, retrying in {delay}s")
                await _asyncio.sleep(delay)
        else:
            raise last_err

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
            "generate_framework": self._tool_generate_framework,
            "start_review_task": self._tool_start_review_task,
            "run_phd_pipeline": self._tool_run_phd_pipeline,
            "list_reviews": self._tool_list_reviews,
            "export_review": self._tool_export_review,
            "semantic_search": self._tool_semantic_search,
            "manage_groups": self._tool_manage_groups,
            "check_task_progress": self._tool_check_task_progress,
            "modify_task_requirements": self._tool_modify_task_requirements,
            "configure_discipline": self._tool_configure_discipline,
            "download_pdf": self._tool_download_pdf,
            "screen_papers": self._tool_screen_papers,
            "enrich_papers": self._tool_enrich_papers,
            "prisma_stage": self._tool_prisma_stage,
            "institutional_login": self._tool_institutional_login,
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
        """General conversation"""
        return {"type": "general_chat"}

    # ── New tools: Framework, PhD Pipeline, Reviews, Search, Groups ──

    async def _tool_generate_framework(self, params: Dict, db: Session) -> Dict:
        """Generate a literature review framework"""
        from app.services.llm.prompts import ORCHESTRATE_FRAMEWORK_PROMPT, get_framework_system_prompt
        import re as _re

        topic = params.get("topic", "")
        if not topic:
            return {"error": "Please provide a research topic"}

        keywords_raw = params.get("keywords", topic)
        if isinstance(keywords_raw, list):
            keywords = keywords_raw
        else:
            keywords = [k.strip() for k in _re.split(r'[,\uff0c]', str(keywords_raw)) if k.strip()]

        language = params.get("language", "zh-CN")

        prompt = ORCHESTRATE_FRAMEWORK_PROMPT.format(
            topic=topic,
            keywords=", ".join(keywords),
            language=language,
            custom_instructions="",
        )

        try:
            raw = await self.llm.complete(
                prompt=prompt,
                system_prompt=get_framework_system_prompt(db),
                temperature=0.3,
                max_tokens=20000,
            )

            # Extract JSON
            if "```json" in raw:
                start = raw.index("```json") + 7
                end = raw.index("```", start)
                json_text = raw[start:end].strip()
            elif "```" in raw:
                start = raw.index("```") + 3
                end = raw.index("```", start)
                json_text = raw[start:end].strip()
            else:
                json_text = raw.strip()

            framework = json.loads(json_text)
            sections_summary = [f"{s.get('id', i+1)}. {s.get('title', 'Untitled')}" for i, s in enumerate(framework.get('sections', []))]
            return {
                "title": framework.get("title", topic),
                "sections_count": len(framework.get("sections", [])),
                "sections": sections_summary,
                "framework_json": framework,
            }
        except Exception as e:
            return {"error": f"Framework generation failed: {e}"}


    async def _tool_start_review_task(self, params: Dict, db: Session) -> Dict:
        """Start an async review generation task — returns immediately with task_id"""
        import asyncio
        from app.services.task_runner import create_task, PipelineTaskRunner, list_tasks
        from app.database import SessionLocal

        # Check for already running tasks to prevent duplicates
        active_tasks = [t for t in list_tasks() if t.get("status") in ["pending", "running"]]
        if active_tasks:
            running_id = active_tasks[0].get("task_id")
            return {"error": f"目前已经有一个综述生成任务 (ID: {running_id}) 正在运行中，为了防止资源抢占，请等待它完成后再发起新的任务。"}

        topic = params.get("topic", "")
        keywords_raw = params.get("keywords", "")
        if isinstance(keywords_raw, list):
            keywords = keywords_raw
        else:
            import re as _re
            keywords = [k.strip() for k in _re.split(r'[,\uff0c]', str(keywords_raw)) if k.strip()]

        if not topic and not keywords:
            return {"error": "Please provide topic or keywords"}
        if not keywords:
            keywords = [topic]

        papers_per_section = int(params.get("papers_per_section", 20))
        citation_style = params.get("citation_style", "harvard")

        task = await create_task(
            topic=topic,
            keywords=keywords,
            papers_per_section=papers_per_section,
            sources=["semantic_scholar"],
            language="zh-CN",
            citation_style=citation_style,
        )

        # Launch background execution
        async def _run_bg():
            bg_db = SessionLocal()
            try:
                runner = PipelineTaskRunner(task=task, db=bg_db)
                await runner.run()
            finally:
                bg_db.close()

        asyncio.create_task(_run_bg())

        return {
            "task_id": task.task_id,
            "status": "started",
            "message": f"异步综述生成任务已启动 (ID: {task.task_id})。共6个步骤，可在 PhD 深度管线页面查看实时进度。",
            "steps": ["生成框架", "自动检索文献", "生成论点", "关联证据", "渲染章节", "组装完整综述"],
            "stream_url": f"/api/reviews/phd/task/{task.task_id}/stream",
        }

    async def _tool_check_task_progress(self, params: Dict, db: Session) -> Dict:
        """Check status and logs of an async task"""
        from app.services.task_runner import get_task
        task_id = params.get("task_id")
        if not task_id:
            return {"error": "Missing task_id"}
        
        task = get_task(task_id)
        if not task:
            return {"error": f"Task {task_id} not found or has been cleared from memory after completion."}
        
        return {
            "task_id": task.task_id,
            "topic": task.topic,
            "status": task.status,
            "summary": task.to_dict(),
            "message": f"任务 {task_id} 目前处于 {task.status} 状态。你可以通过日志查看具体执行进度。"
        }

    async def _tool_modify_task_requirements(self, params: Dict, db: Session) -> Dict:
        """Modify or add keywords to a running task"""
        from app.services.task_runner import get_task
        task_id = params.get("task_id")
        if not task_id:
            return {"error": "Missing task_id"}
        
        task = get_task(task_id)
        if not task:
            return {"error": f"Task {task_id} not found."}
        
        added_kws = []
        raw_kws = params.get("additional_keywords", "")
        if raw_kws:
            import re as _re
            added_kws = [k.strip() for k in _re.split(r'[,\uff0c]', str(raw_kws)) if k.strip()]
            task.keywords.extend(added_kws)
        
        new_topic = params.get("new_topic")
        if new_topic:
            task.topic = new_topic
            
        return {
            "success": True,
            "task_id": task_id,
            "added_keywords": added_kws,
            "current_topic": task.topic,
            "message": f"已经为任务 {task_id} 成功追加了需求。AI 会在接下来的步骤中尝试包含这些新内容。"
        }

    async def _tool_run_phd_pipeline(self, params: Dict, db: Session) -> Dict:
        """Run PhD pipeline stages asynchronously so Agent doesn't block"""
        from app.services.review import SectionReviewPipelineService
        from app.services.semantic_search import get_semantic_search_service
        from app.database import SessionLocal
        import asyncio

        stage = params.get("stage", "init")
        review_id_raw = params.get("review_id")
        
        async def _run_init_bg(keywords: list):
            bg_db = SessionLocal()
            try:
                from app.services.review import generate_review as core_generate_review
                from app.schemas.review import ReviewGenerate
                from app.services.task_runner import create_manual_task, update_manual_task_step
                llm_svc = OpenAIService(settings=settings)
                sem_svc = get_semantic_search_service()
                pipeline = SectionReviewPipelineService(db=bg_db, llm_service=llm_svc, semantic_search_service=sem_svc)

                payload = ReviewGenerate(
                    keywords=keywords,
                    phd_pipeline=True,
                    framework_only=True,
                )
                gen_resp = await core_generate_review(db=bg_db, payload=payload)
                if gen_resp.success:
                    rid = gen_resp.review_id
                    framework = gen_resp.preview_markdown
                    # Create PipelineTask for monitoring
                    await create_manual_task(
                        topic=keywords[0] if keywords else "Literature Review",
                        keywords=keywords, review_id=rid, source="agent_tool",
                    )
                    update_manual_task_step(rid, "framework", "done", "框架生成完成")
                    update_manual_task_step(rid, "claims", "running", "正在生成论点...")
                    await pipeline.generate_section_claims(
                        review_id=rid,
                        section_outline=framework or "",
                    )
                    update_manual_task_step(rid, "claims", "done", "论点生成完成")
            except Exception as e:
                logger.error(f"Async init failed: {e}")
            finally:
                bg_db.close()

        async def _run_evidence_bg(rid: int):
            bg_db = SessionLocal()
            try:
                from app.services.task_runner import update_manual_task_step
                llm_svc = OpenAIService(settings=settings)
                sem_svc = get_semantic_search_service()
                pipeline = SectionReviewPipelineService(db=bg_db, llm_service=llm_svc, semantic_search_service=sem_svc)
                await pipeline.attach_evidence_for_review(review_id=rid)
                update_manual_task_step(rid, "evidence", "done", "证据关联完成")
            except Exception as e:
                from app.services.task_runner import update_manual_task_step
                update_manual_task_step(rid, "evidence", "failed", error=str(e))
                logger.error(f"Async evidence failed: {e}")
            finally:
                bg_db.close()

        async def _run_render_bg(rid: int):
            bg_db = SessionLocal()
            try:
                from app.services.task_runner import update_manual_task_step
                llm_svc = OpenAIService(settings=settings)
                sem_svc = get_semantic_search_service()
                pipeline = SectionReviewPipelineService(db=bg_db, llm_service=llm_svc, semantic_search_service=sem_svc)
                await pipeline.render_review_sections(review_id=rid)
                update_manual_task_step(rid, "render", "done", "章节渲染完成")
            except Exception as e:
                from app.services.task_runner import update_manual_task_step
                update_manual_task_step(rid, "render", "failed", error=str(e))
                logger.error(f"Async render failed: {e}")
            finally:
                bg_db.close()

        if stage == "init":
            import re as _re
            keywords_raw = params.get("keywords", "")
            if isinstance(keywords_raw, list):
                keywords = keywords_raw
            else:
                keywords = [k.strip() for k in _re.split(r'[,\uff0c]', str(keywords_raw)) if k.strip()]

            if not keywords:
                return {"error": "Please provide keywords for init stage"}

            asyncio.create_task(_run_init_bg(keywords))
            return {
                "stage": "init_started",
                "message": f"已在后台启动初始化阶段（生成论点）。稍后可在监控面板或这里询问结果。",
            }

        elif stage == "evidence":
            if not review_id_raw:
                return {"error": "review_id is required for evidence stage"}
            rid = int(review_id_raw)
            # Track in PipelineTask
            from app.services.task_runner import update_manual_task_step, get_task_by_review_id, create_manual_task
            task = get_task_by_review_id(rid)
            if not task:
                task = await create_manual_task(
                    topic=params.get("topic", f"Review #{rid}"),
                    keywords=[], review_id=rid, source="agent_tool",
                )
            update_manual_task_step(rid, "evidence", "running", "Agent 启动证据关联...")
            asyncio.create_task(_run_evidence_bg(rid))
            return {
                "review_id": rid,
                "stage": "evidence_started",
                "message": f"已在后台启动证据关联阶段（查询文献支撑）。",
            }

        elif stage == "render":
            if not review_id_raw:
                return {"error": "review_id is required for render stage"}
            rid = int(review_id_raw)
            # Track in PipelineTask
            from app.services.task_runner import update_manual_task_step, get_task_by_review_id, create_manual_task
            task = get_task_by_review_id(rid)
            if not task:
                task = await create_manual_task(
                    topic=params.get("topic", f"Review #{rid}"),
                    keywords=[], review_id=rid, source="agent_tool",
                )
            update_manual_task_step(rid, "render", "running", "Agent 启动章节渲染...")
            asyncio.create_task(_run_render_bg(rid))
            return {
                "review_id": rid,
                "stage": "render_started",
                "message": f"已在后台启动最终渲染阶段（生成完整文本）。",
            }

        return {"error": f"Unknown stage: {stage}. Use init/evidence/render"}

    async def _tool_list_reviews(self, params: Dict, db: Session) -> Dict:
        """List generated reviews"""
        from app.models import Review

        limit = int(params.get("limit", 10))
        reviews = db.query(Review).order_by(Review.id.desc()).limit(limit).all()

        items = []
        for r in reviews:
            items.append({
                "id": r.id,
                "keywords": r.keywords if hasattr(r, 'keywords') else None,
                "status": r.status if hasattr(r, 'status') else None,
                "created_at": str(r.created_at) if hasattr(r, 'created_at') else None,
            })

        return {"total": len(items), "reviews": items}

    async def _tool_export_review(self, params: Dict, db: Session) -> Dict:
        """Export review to markdown"""
        from app.models import Review

        review_id = params.get("review_id")
        if not review_id:
            return {"error": "review_id is required"}

        review = db.query(Review).filter(Review.id == int(review_id)).first()
        if not review:
            return {"error": f"Review {review_id} not found"}

        content = review.content if hasattr(review, 'content') else ""
        return {
            "review_id": int(review_id),
            "content_length": len(content) if content else 0,
            "preview": (content[:500] + "...") if content and len(content) > 500 else content,
        }

    async def _tool_semantic_search(self, params: Dict, db: Session) -> Dict:
        """Semantic/vector search across papers"""
        from app.services.semantic_search import get_semantic_search_service

        query = params.get("query", "")
        if not query:
            return {"error": "Please provide a search query"}

        top_k = int(params.get("top_k", 5))

        try:
            service = get_semantic_search_service()
            results = await service.search(query=query, top_k=top_k)

            items = []
            for r in results:
                items.append({
                    "paper_id": r.get("paper_id") or r.get("id"),
                    "title": r.get("title", "Unknown"),
                    "score": round(r.get("score", 0), 4) if r.get("score") else None,
                    "year": r.get("year"),
                })

            return {"query": query, "results_count": len(items), "results": items}
        except Exception as e:
            return {"error": f"Semantic search failed: {e}"}

    async def _tool_manage_groups(self, params: Dict, db: Session) -> Dict:
        """Manage paper groups"""
        action = params.get("action", "list")

        if action == "list":
            groups = db.query(PaperGroup).all()
            items = []
            for g in groups:
                count = db.query(PaperGroupAssociation).filter(
                    PaperGroupAssociation.group_id == g.id
                ).count()
                items.append({
                    "id": g.id,
                    "name": g.name,
                    "description": g.description if hasattr(g, 'description') else None,
                    "paper_count": count,
                })
            return {"groups": items, "total": len(items)}

        elif action == "create":
            name = params.get("group_name", "")
            if not name:
                return {"error": "group_name is required"}
            group = PaperGroup(name=name)
            db.add(group)
            db.commit()
            db.refresh(group)
            return {"created": True, "group_id": group.id, "name": name}

        elif action == "add_papers":
            group_id = params.get("group_id")
            paper_ids = params.get("paper_ids", [])
            if not group_id or not paper_ids:
                return {"error": "group_id and paper_ids are required"}

            added = 0
            for pid in paper_ids:
                exists = db.query(PaperGroupAssociation).filter(
                    PaperGroupAssociation.group_id == int(group_id),
                    PaperGroupAssociation.paper_id == int(pid),
                ).first()
                if not exists:
                    db.add(PaperGroupAssociation(group_id=int(group_id), paper_id=int(pid)))
                    added += 1
            db.commit()
            return {"added": added, "group_id": int(group_id)}

        elif action == "remove_papers":
            group_id = params.get("group_id")
            paper_ids = params.get("paper_ids", [])
            if not group_id or not paper_ids:
                return {"error": "group_id and paper_ids are required"}

            removed = 0
            for pid in paper_ids:
                count = db.query(PaperGroupAssociation).filter(
                    PaperGroupAssociation.group_id == int(group_id),
                    PaperGroupAssociation.paper_id == int(pid),
                ).delete()
                removed += count
    async def _tool_configure_discipline(self, params: Dict, db: Session) -> Dict:
        """AI 自动生成学科配置并保存"""
        from app.services.llm.prompts import DisciplineProfile, save_discipline_profile

        description = params.get("description", "")
        if not description:
            return {"error": "请描述你的学科方向，例如：'我是做计算机视觉的' 或 '建筑学与城市规划'"}

        # 用 LLM 生成完整的 DisciplineProfile
        generation_prompt = f"""Based on the following discipline description, generate a complete academic discipline profile in JSON format.

User's discipline description: "{description}"

Generate a JSON object with these exact fields:
{{
  "field_name": "学科名称（中文，2-6个字，如：计算机视觉、建筑学、分子生物学）",
  "researcher_identity": "一句话描述研究者身份，如：你是一位资深的计算机视觉领域学术研究者",
  "review_system_prompt": "综述生成的 system prompt（中文，约50-100字，描述AI在该学科领域的角色和能力）",
  "review_user_template": "综述生成的 user prompt 模板，必须包含 {{{{keywords}}}}、{{{{year_range}}}}、{{{{paper_summaries}}}} 三个占位符",
  "example_timeline_topics": ["该学科3-5个典型的研究阶段/时间线主题"],
  "example_theme_labels": ["该学科5-8个典型的研究主题标签"],
  "claims_system_prompt": "论点生成的 system prompt（中文，包含 {{field_name}} 占位符）",
  "framework_system_prompt": "框架生成的 system prompt（中文，描述AI规划该学科综述框架的角色）",
  "section_system_prompt": "章节生成的 system prompt（中文，描述AI撰写该学科学术综述的角色）"
}}

Requirements:
1. All prompts should be in Chinese
2. The content should be highly specific to the discipline described
3. The review_user_template MUST contain the three placeholders: {{{{keywords}}}}, {{{{year_range}}}}, {{{{paper_summaries}}}}
4. Output ONLY valid JSON, no markdown or extra text"""

        try:
            result = await self.llm.complete_json(
                prompt=generation_prompt,
                system_prompt="You are an expert at configuring academic AI systems for specific disciplines. Output only valid JSON.",
                temperature=0.3,
            )

            # Validate and create DisciplineProfile
            profile = DisciplineProfile(**result)

            # Save to database
            save_discipline_profile(db, profile)

            # Optionally save as preset
            preset_name = params.get("preset_name")
            if preset_name:
                from app.models.system_setting import SystemSetting
                presets_record = db.query(SystemSetting).filter(
                    SystemSetting.key == "discipline_presets"
                ).first()
                presets = (presets_record.value or {}) if presets_record else {}
                presets[preset_name] = profile.model_dump()
                if presets_record:
                    presets_record.value = presets
                else:
                    db.add(SystemSetting(key="discipline_presets", value=presets))
                db.commit()

            return {
                "success": True,
                "field_name": profile.field_name,
                "researcher_identity": profile.researcher_identity,
                "preset_saved": preset_name or None,
                "message": f"学科配置已成功切换为「{profile.field_name}」！所有综述生成、论点提取、框架规划等功能现在都将以该学科身份运行。",
            }
        except Exception as e:
            logger.error(f"Configure discipline failed: {e}", exc_info=True)
            return {"error": f"学科配置生成失败: {e}"}

            db.commit()
            return {"removed": removed, "group_id": int(group_id)}

        return {"error": f"Unknown action: {action}. Use list/create/add_papers/remove_papers"}

    # ── 新功能工具 ──────────────────────────────────────────

    async def _tool_download_pdf(self, params: Dict, db: Session) -> Dict:
        """下载文献 PDF（支持批量）"""
        from app.services.pdf_service import PDFDownloadService

        paper_ids = params.get("paper_ids", [])
        if isinstance(paper_ids, (int, str)):
            paper_ids = [int(paper_ids)]
        elif isinstance(paper_ids, list):
            paper_ids = [int(x) for x in paper_ids]

        if not paper_ids:
            return {"error": "请提供文献 ID（paper_ids）"}

        service = PDFDownloadService(db)

        if len(paper_ids) == 1:
            result = await service.download_paper_pdf(paper_ids[0])
            return {
                "paper_id": paper_ids[0],
                "success": result is not None,
                "pdf_path": result,
                "message": f"PDF 下载{'成功' if result else '失败'}",
            }
        else:
            results = await service.batch_download(paper_ids)
            return {
                "total": len(paper_ids),
                "success_count": len(results["success"]),
                "failed_count": len(results["failed"]),
                "skipped_count": len(results["skipped"]),
                "success_ids": results["success"],
                "failed_ids": results["failed"],
            }

    async def _tool_screen_papers(self, params: Dict, db: Session) -> Dict:
        """AI 自动筛选暂存库文献"""
        from app.services.screening_service import ScreeningService

        topic = params.get("topic", "")
        if not topic:
            return {"error": "请提供研究主题（topic），用于评估文献相关性"}

        crawl_job_id = params.get("crawl_job_id")
        keywords = params.get("keywords", "")

        try:
            service = ScreeningService(db)
            result = await service.ai_screen(
                topic=topic,
                crawl_job_ids=[int(crawl_job_id)] if crawl_job_id else None,
                keyword_filter=keywords if keywords else None,
            )
            return {
                "topic": topic,
                "screened_count": result.get("total", 0),
                "promoted": result.get("promoted", 0),
                "rejected": result.get("rejected", 0),
                "pending_review": result.get("pending_review", 0),
                "message": f"AI 筛选完成: {result.get('promoted', 0)} 篇纳入, {result.get('rejected', 0)} 篇排除, {result.get('pending_review', 0)} 篇待审",
            }
        except Exception as e:
            logger.error("AI screening failed: %s", e, exc_info=True)
            return {"error": f"AI 筛选失败: {e}"}

    async def _tool_enrich_papers(self, params: Dict, db: Session) -> Dict:
        """补全文献元数据"""
        from app.services.enrichment_service import EnrichmentService

        paper_ids = params.get("paper_ids", [])
        if isinstance(paper_ids, (int, str)):
            paper_ids = [int(paper_ids)]
        elif isinstance(paper_ids, list) and paper_ids:
            paper_ids = [int(x) for x in paper_ids]

        limit = int(params.get("limit", 20))

        try:
            service = EnrichmentService(db)

            if paper_ids:
                result = await service.enrich_papers(paper_ids)
            else:
                # 自动选择缺失信息的文献
                result = await service.enrich_incomplete(limit=limit)

            return {
                "enriched_count": result.get("enriched", 0),
                "failed_count": result.get("failed", 0),
                "skipped_count": result.get("skipped", 0),
                "details": result.get("details", [])[:5],
                "message": f"元数据补全完成: {result.get('enriched', 0)} 篇更新",
            }
        except Exception as e:
            logger.error("Enrichment failed: %s", e, exc_info=True)
            return {"error": f"元数据补全失败: {e}"}

    async def _tool_prisma_stage(self, params: Dict, db: Session) -> Dict:
        """PRISMA 筛选阶段管理"""
        from app.services.prisma_state_machine import (
            PRISMA_STAGES,
            validate_transition,
        )

        action = params.get("action", "stats")

        if action == "stats":
            # 统计各阶段数量
            counts = {}
            for stage in PRISMA_STAGES:
                count = (
                    db.query(StagingPaper)
                    .filter(StagingPaper.screening_stage == stage)
                    .count()
                )
                counts[stage] = count
            total = db.query(StagingPaper).count()
            return {"total": total, "stages": counts}

        staging_ids = params.get("staging_paper_ids", [])
        if isinstance(staging_ids, (int, str)):
            staging_ids = [int(staging_ids)]
        elif isinstance(staging_ids, list):
            staging_ids = [int(x) for x in staging_ids]

        target_stage = params.get("target_stage", "")
        exclusion_reason = params.get("exclusion_reason")

        if not staging_ids or not target_stage:
            return {"error": "请提供 staging_paper_ids 和 target_stage"}

        if target_stage not in PRISMA_STAGES:
            return {"error": f"无效阶段: {target_stage}，可选: {PRISMA_STAGES}"}

        success = 0
        errors = []
        for sid in staging_ids:
            paper = db.query(StagingPaper).filter(StagingPaper.id == sid).first()
            if not paper:
                errors.append(f"ID {sid} 不存在")
                continue
            current = paper.screening_stage or "identification"
            valid, err = validate_transition(current, target_stage)
            if not valid:
                errors.append(f"ID {sid}: {err}")
                continue
            paper.screening_stage = target_stage
            if exclusion_reason:
                paper.exclusion_reason = exclusion_reason
            success += 1

        db.commit()
        return {
            "action": action,
            "target_stage": target_stage,
            "success": success,
            "errors": errors[:5] if errors else [],
            "message": f"{success} 篇文献已推进到 {target_stage}" + (f"，{len(errors)} 篇失败" if errors else ""),
        }

    async def _tool_institutional_login(self, params: Dict, db: Session) -> Dict:
        """登录机构访问"""
        from app.services.institutional_auth import get_institutional_auth_service

        auth = get_institutional_auth_service()

        if auth.is_authenticated:
            return {
                "success": True,
                "message": "机构访问已认证，无需重新登录",
                "status": auth.get_status(),
            }

        login_url = getattr(settings, "INSTITUTIONAL_LOGIN_URL", "")
        username = getattr(settings, "INSTITUTIONAL_USERNAME", "")
        password = getattr(settings, "INSTITUTIONAL_PASSWORD", "")
        auth_type = getattr(settings, "INSTITUTIONAL_AUTH_TYPE", "ezproxy")

        if not login_url or not username:
            return {"error": "未配置机构访问信息，请在设置页面配置"}

        success = auth.login(
            login_url=login_url,
            username=username,
            password=password,
            auth_type=auth_type,
            headless=getattr(settings, "SELENIUM_HEADLESS", True),
        )

        return {
            "success": success,
            "message": f"机构{'登录成功' if success else '登录失败'}",
            "status": auth.get_status(),
        }

    # ── Result summary ──────────────────────────────────────

    async def _summarize_result(
        self,
        user_message: str,
        tool: str,
        params: Dict,
        result: Dict,
        db: Session,
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
            system_prompt=self._build_system_prompt(SUMMARY_SYSTEM_PROMPT, db),
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
