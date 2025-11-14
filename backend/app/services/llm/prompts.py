from typing import List
from pydantic import BaseModel


class PromptConfig(BaseModel):
    """文献综述提示词配置"""
    system_prompt: str
    user_template: str  # 包含 {{keywords}}, {{year_range}}, {{paper_summaries}} 等占位符


class PromptPreviewResponse(BaseModel):
    """用于前端预览渲染后的 Prompt 内容"""
    rendered_prompt: str


DEFAULT_LIT_REVIEW_PROMPT_CONFIG = PromptConfig(
    system_prompt=(
        "你是一位拥有城市设计与城市规划双重背景的资深学术研究者，"
        "擅长撰写系统性的城市设计相关文献综述，能够从大量论文中抽取发展脉络、研究主题与研究空白。"
    ),
    user_template=(
        "请基于下列信息撰写一篇结构化的、面向学术读者的文献综述。\n\n"
        "【研究主题关键词】\n"
        "{{keywords}}\n\n"
        "【时间范围】\n"
        "{{year_range}}\n\n"
        "【候选文献摘要】\n"
        "{{paper_summaries}}\n\n"
        "写作要求：\n"
        "1. 用结构化 Markdown 输出，章节结构建议为：\n"
        "   - 引言：研究背景与问题动机\n"
        "   - 研究进展：按时间或主题分段梳理主要研究方向\n"
        "   - 方法与技术路径：归纳主要方法类别与代表性工作\n"
        "   - 综合讨论：比较不同研究路线的贡献、局限与适用场景\n"
        "   - 研究空白与未来方向：指出尚未充分研究的问题与潜在突破点\n"
        "2. 行文要基于提供的文献，不要凭空捏造不存在的论文。\n"
        "3. 在涉及具体研究工作时，引用文献列表中的编号或标题片段以帮助读者定位。\n\n"
        "在 Markdown 正文之后，请额外输出一个 JSON 代码块，格式示意如下（注意保持合法 JSON）：\n"
        "```json\n"
        "{\n"
        "  \"timeline\": [\n"
        "    {\"period\": \"2010-2013\", \"topic\": \"早期可持续城市设计\", \"paper_ids\": [1, 3, 5]},\n"
        "    {\"period\": \"2014-2017\", \"topic\": \"数据驱动的城市形态分析\", \"paper_ids\": [2, 4]}\n"
        "  ],\n"
        "  \"topics\": [\n"
        "    {\"label\": \"公共空间与步行友好性\", \"count\": 8},\n"
        "    {\"label\": \"街道网络形态\", \"count\": 5}\n"
        "  ]\n"
        "}\n"
        "```\n"
        "其中 paper_ids 需对应你在综述中重点讨论的文献编号或内部索引。"
    ),
)