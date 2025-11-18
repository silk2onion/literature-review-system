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
        "3. 在涉及具体研究工作时，引用文献列表中的编号或标题片段以帮助读者定位。\n"
        "4. **关注期刊质量**：如果文献信息中提供了期刊分区（Q1/Q2）、影响因子或收录情况（SCI/SSCI），请优先讨论高水平期刊的论文，并在文中适当提及（例如“发表于 Q1 期刊《...》的研究指出...”）。\n\n"
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


# ========== 章节级 PhD 管线：论点–证据 + RAG + 渲染 ==========

GENERATE_SECTION_CLAIMS_PROMPT = """
你是一位资深的城市设计领域学术研究者，擅长将章节草稿拆解为结构化的“论点–证据”表。

【任务】
根据给定的“章节提纲”，生成一个 JSON 格式的“论点–证据”表（SectionClaimTable）。

【章节提纲】
{{section_outline}}

【输出要求】
1.  严格按照以下 JSON 格式输出，不要添加任何额外说明。
2.  `section_id` 和 `section_title` 直接从提纲中提取或生成。
3.  `claims` 数组需要包含多条论点，每条论点都是对章节提纲中某个要点的细化。
4.  每条 `ClaimEvidence` 必须包含：
    - `claim_id`: 从 1 开始的整数编号。
    - `text`: 论点的自然语言陈述句。
    - `rag_query`: 一个精确、简洁的关键词或短语，用于后续在文献数据库中进行向量检索（RAG），以寻找支持该论点的证据。

【JSON 输出格式示例】
```json
{
  "section_id": "2.1",
  "section_title": "街道活力的度量方法演进",
  "claims": [
    {
      "claim_id": 1,
      "text": "早期的街道活力研究主要依赖于现场观察和手动计数等传统方法。",
      "rag_query": "street vitality traditional observation methods"
    },
    {
      "claim_id": 2,
      "text": "近年来，基于手机信令、社交媒体签到和街景图像分析等大数据技术，为街道活力研究提供了新的定量视角。",
      "rag_query": "urban vitality big data analytics mobile phone data"
    },
    {
      "claim_id": 3,
      "text": "空间句法（Space Syntax）模型被广泛应用于分析街道网络结构与步行流量潜力的关系。",
      "rag_query": "space syntax street network analysis pedestrian flow"
    }
  ]
}
```
"""

RENDER_SECTION_FROM_CLAIMS_PROMPT_ZH = """
你是一位精通城市设计领域的学术写作者，擅长将结构化的“论点–证据”材料组织成流畅、连贯的学术段落。

【任务】
根据给定的“论点–证据”表（包含每条论点及其支撑文献片段），撰写一段完整的章节正文。

【写作要求】
1.  **忠于原文**：严格基于提供的“论点”和“文献片段”进行写作，不要引入外部知识或虚构信息。
2.  **引用格式**：在段落中恰当的位置，使用 `[<citation_number>]` 的格式嵌入引用。如果一个论点由多篇文献支持，可以使用 `[<num1>, <num2>]` 的格式。
3.  **自然流畅**：将各个论点有机地组织起来，形成逻辑清晰、语言流畅的学术段落，而不是简单的罗列。
4.  **仅输出正文**：你的输出应该只有渲染后的章节正文，不要包含任何标题、前言或额外说明。

【论点与证据材料】
{{claims_payload}}
"""

RENDER_SECTION_FROM_CLAIMS_PROMPT_EN = """
You are an expert academic writer in the field of urban design, skilled at organizing structured "claim-evidence" materials into fluent and coherent academic paragraphs.

【Task】
Write a complete section text based on the provided "claim-evidence" table, which includes claims and their supporting literature snippets.

【Writing Requirements】
1.  **Adhere to the Source**: Strictly base your writing on the provided "claims" and "literature snippets." Do not introduce external knowledge or fabricate information.
2.  **Citation Format**: Insert citations at appropriate places in the text using the format `[<citation_number>]`. If a claim is supported by multiple papers, use the format `[<num1>, <num2>]`.
3.  **Natural Flow**: Organize the claims into a logically clear and linguistically fluent academic paragraph, rather than a simple list.
4.  **Output Text Only**: Your output should only be the rendered section text, without any titles, preambles, or extra explanations.

【Claims and Evidence Material】
{{claims_payload}}
"""