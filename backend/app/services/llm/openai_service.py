"""
OpenAI兼容API服务
支持OpenAI、Claude、本地模型等多种LLM服务
"""
import logging
from typing import List, Optional, Dict, Any
from openai import AsyncOpenAI
from app.config import Settings
from app.models.paper import Paper
from app.schemas.review import LitReviewLLMResult, TimelinePoint, TopicStat
from app.services.llm.prompts import PromptConfig, DEFAULT_LIT_REVIEW_PROMPT_CONFIG

logger = logging.getLogger(__name__)


class OpenAIService:
    """OpenAI兼容LLM服务"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL
        )
        self.model = settings.OPENAI_MODEL
    
    async def generate_review_framework(
        self,
        keywords: List[str],
        papers: List[Paper]
    ) -> str:
        """
        生成综述框架
        
        Args:
            keywords: 关键词列表
            papers: 文献列表
            
        Returns:
            综述框架文本
        """
        try:
            # 构建prompt
            prompt = self._build_framework_prompt(keywords, papers)
            
            # 调用LLM
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一位资深的学术研究专家，擅长撰写城市设计相关的文献综述。"
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=2000
            )
            
            framework = response.choices[0].message.content or ""
            logger.info(f"综述框架生成成功，长度: {len(framework)}")
            return framework
            
        except Exception as e:
            logger.error(f"生成综述框架失败: {e}")
            raise
    
    async def generate_review_content(
        self,
        framework: str,
        papers: List[Paper]
    ) -> str:
        """
        基于框架生成详细综述内容
        
        Args:
            framework: 综述框架
            papers: 文献列表
            
        Returns:
            详细综述内容
        """
        try:
            # 构建prompt
            prompt = self._build_content_prompt(framework, papers)
            
            # 调用LLM
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一位资深的学术研究专家，擅长撰写城市设计相关的文献综述。请基于提供的框架和文献，撰写详细、专业、有深度的综述内容。"
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=4000
            )
            
            content = response.choices[0].message.content or ""
            logger.info(f"综述内容生成成功，长度: {len(content)}")
            return content
            
        except Exception as e:
            logger.error(f"生成综述内容失败: {e}")
            raise
    
    async def generate_lit_review(
        self,
        keywords: List[str],
        papers: List[Paper],
        prompt_config: Optional[PromptConfig] = None,
        custom_prompt: Optional[str] = None,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
    ) -> LitReviewLLMResult:
        """
        一次性生成结构化文献综述:
        - Markdown 正文
        - timeline / topics 统计 JSON

        Args:
            keywords: 关键词列表
            papers: 候选文献列表
            prompt_config: 默认提示词配置，如不提供则使用 DEFAULT_LIT_REVIEW_PROMPT_CONFIG
            custom_prompt: 前端传入的自定义提示词，若非空则优先使用
            year_from: 起始年份
            year_to: 结束年份
        """
        cfg = prompt_config or DEFAULT_LIT_REVIEW_PROMPT_CONFIG

        # 1. 构造 year_range 文本
        if year_from and year_to:
            year_range = f"{year_from}–{year_to}"
        elif year_from and not year_to:
            year_range = f"{year_from}–至今"
        elif not year_from and year_to:
            year_range = f"–{year_to}"
        else:
            year_range = "未限定"

        # 2. 构造 paper_summaries 文本（简化版）
        paper_summaries_parts: List[str] = []
        for idx, p in enumerate(papers, start=1):
            title = p.title or "Untitled"
            authors = ""
            if getattr(p, "authors", None):
                # authors 在模型里是 JSON，统一转成字符串
                if isinstance(p.authors, list):
                    authors = ", ".join(p.authors[:3])
                else:
                    authors = str(p.authors)
            year = getattr(p, "year", None)
            line = f"{idx}. {title}"
            meta = []
            if authors:
                meta.append(f"作者: {authors}")
            if year:
                meta.append(f"年份: {year}")
            if meta:
                line += " （" + "；".join(meta) + "）"
            paper_summaries_parts.append(line)
        paper_summaries = "\n".join(paper_summaries_parts) if paper_summaries_parts else "暂无可用文献信息"

        # 3. 渲染 user prompt
        if custom_prompt:
            # 如果前端提供了自定义提示词，则视作完整 user_prompt，仍可插入少量上下文
            user_content = f"{custom_prompt}\n\n【系统补充信息】\n关键词: {', '.join(keywords)}\n时间范围: {year_range}\n文献简要列表:\n{paper_summaries}"
        else:
            user_content = (
                cfg.user_template
                .replace("{{keywords}}", ", ".join(keywords))
                .replace("{{year_range}}", year_range)
                .replace("{{paper_summaries}}", paper_summaries)
            )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": cfg.system_prompt},
                    {"role": "user", "content": user_content},
                ],
                temperature=0.7,
                max_tokens=6000,
            )
        except Exception as e:
            logger.error(f"生成结构化文献综述失败: {e}")
            raise

        full_text = response.choices[0].message.content or ""
        logger.info("Lit review LLM 调用成功，长度: %d", len(full_text))

        # 4. 从返回中解析 Markdown 正文与 JSON 区块
        markdown_part, json_part = self._split_markdown_and_json(full_text)

        timeline: List[TimelinePoint] = []
        topics: List[TopicStat] = []

        if json_part:
            try:
                import json as _json
                data = _json.loads(json_part)
                for item in data.get("timeline", []):
                    timeline.append(
                        TimelinePoint(
                            period=str(item.get("period", "")),
                            topic=str(item.get("topic", "")),
                            paper_ids=[int(i) for i in item.get("paper_ids", []) if isinstance(i, (int, str))],
                        )
                    )
                for t in data.get("topics", []):
                    topics.append(
                        TopicStat(
                            label=str(t.get("label", "")),
                            count=int(t.get("count", 0)),
                        )
                    )
            except Exception as e:
                logger.warning("解析 LLM 返回的 JSON 统计失败，将仅返回 Markdown。错误: %s", e)

        return LitReviewLLMResult(
            markdown=markdown_part.strip() or full_text,
            timeline=timeline,
            topics=topics,
        )

    def _split_markdown_and_json(self, full_text: str) -> (str, Optional[str]):
        """
        从 LLM 返回的文本中切分出:
        - markdown 部分
        - JSON 代码块部分（去掉 ```json ``` 包裹）

        若未找到 JSON，则返回 (full_text, None)
        """
        if "```json" not in full_text:
            return full_text, None

        start = full_text.find("```json")
        end = full_text.find("```", start + 7)
        if end == -1:
            # 起始有 ```json 但没有闭合，容错处理
            json_block = full_text[start + 7 :]
            markdown = full_text[:start]
        else:
            json_block = full_text[start + 7 : end]
            markdown = full_text[:start] + full_text[end + 3 :]

        return markdown, json_block

    def _build_framework_prompt(
        self,
        keywords: List[str],
        papers: List[Paper]
    ) -> str:
        """构建生成框架的prompt"""
        keywords_str = "、".join(keywords)
        
        # 提取文献摘要
        paper_summaries = []
        for i, paper in enumerate(papers[:20], 1):  # 最多使用20篇文献
            summary = f"{i}. {paper.title}\n"
            if paper.authors:
                authors = ", ".join(paper.authors[:3])  # 最多显示3位作者
                summary += f"   作者: {authors}\n"
            if paper.abstract:
                abstract = paper.abstract[:300] + "..." if len(paper.abstract) > 300 else paper.abstract
                summary += f"   摘要: {abstract}\n"
            paper_summaries.append(summary)
        
        papers_text = "\n".join(paper_summaries)
        
        prompt = f"""请基于以下关键词和文献，为一篇城市设计相关的文献综述生成详细的框架大纲。

关键词：{keywords_str}

相关文献：
{papers_text}

请生成一个结构清晰、逻辑严密的综述框架，包括：
1. 引言（研究背景和意义）
2. 主要研究主题（2-4个核心主题）
3. 研究方法和技术
4. 研究发现和讨论
5. 未来研究方向
6. 结论

框架要求：
- 每个部分有明确的小标题
- 简要说明每部分的内容要点
- 体现文献之间的关联和发展脉络
- 突出研究的前沿性和创新性

请以Markdown格式输出框架。"""
        
        return prompt
    
    def _build_content_prompt(
        self,
        framework: str,
        papers: List[Paper]
    ) -> str:
        """构建生成详细内容的prompt"""
        # 提取文献详细信息
        paper_details = []
        for i, paper in enumerate(papers[:20], 1):
            detail = f"{i}. **{paper.title}**\n"
            if paper.authors:
                authors = ", ".join(paper.authors)
                detail += f"   - 作者: {authors}\n"
            if paper.year:
                detail += f"   - 年份: {paper.year}\n"
            if paper.journal:
                detail += f"   - 期刊: {paper.journal}\n"
            if paper.abstract:
                detail += f"   - 摘要: {paper.abstract}\n"
            paper_details.append(detail)
        
        papers_text = "\n".join(paper_details)
        
        prompt = f"""请基于以下框架和文献，撰写详细的文献综述内容。

综述框架：
{framework}

参考文献详情：
{papers_text}

撰写要求：
1. 严格按照框架结构展开
2. 充分引用和分析提供的文献
3. 内容要专业、准确、有深度
4. 体现研究的发展脉络和前沿动态
5. 适当使用学术术语和专业表达
6. 在合适的位置标注文献引用（使用数字编号）
7. 字数在3000-5000字之间

请以Markdown格式输出完整的综述内容。"""
        
        return prompt
    
    async def summarize_paper(self, paper: Paper) -> str:
        """
        总结单篇文献的核心内容
        
        Args:
            paper: Paper对象
            
        Returns:
            文献摘要
        """
        try:
            if not paper.abstract:
                return "暂无摘要"
            
            prompt = f"""请用2-3句话总结以下文献的核心贡献和主要发现：

标题：{paper.title}
摘要：{paper.abstract}

要求：简洁、准确、突出创新点。"""
            
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是一位专业的学术文献分析专家。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=200
            )
            
            summary = response.choices[0].message.content
            return summary
            
        except Exception as e:
            logger.error(f"总结文献失败: {e}")
            return paper.abstract[:200] if paper.abstract else "暂无摘要"