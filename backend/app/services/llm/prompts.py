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
{section_outline}

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
{{
  "section_id": "2.1",
  "section_title": "街道活力的度量方法演进",
  "claims": [
    {{
      "claim_id": 1,
      "text": "早期的街道活力研究主要依赖于现场观察和手动计数等传统方法。",
      "rag_query": "street vitality traditional observation methods"
    }},
    {{
      "claim_id": 2,
      "text": "近年来，基于手机信令、社交媒体签到和街景图像分析等大数据技术，为街道活力研究提供了新的定量视角。",
      "rag_query": "urban vitality big data analytics mobile phone data"
    }},
    {{
      "claim_id": 3,
      "text": "空间句法（Space Syntax）模型被广泛应用于分析街道网络结构与步行流量潜力的关系。",
      "rag_query": "space syntax street network analysis pedestrian flow"
    }}
  ]
}}
```
"""

RENDER_SECTION_FROM_CLAIMS_PROMPT_ZH = """
你是一位精通城市设计领域的学术写作者，擅长将结构化的“论点–证据”材料组织成流畅、连贯的学术长文段落。

【任务】
根据给定的“论点–证据”表（包含每条论点及其支撑文献片段），撰写一段详实、深度的完整章节正文。

【写作要求（非常重要）】
1.  **深度与长度**：请将这一章写成一篇**深度的学术短文**（约 500-800 字），包含 3-5 个逻辑延展的自然段。不要只是简单地罗列论点。
2.  **连贯的学术叙事（Connecting Sentences）**：**绝对不要**像列清单一样把论点生硬地拼凑在一起。你必须使用优秀的学术语言，在不同的论点之间加入**不需要引用的连接句、过渡句和背景解释句**，让整篇文章读起来气势连贯、逻辑严密、像一篇真正由人类学者精心雕琢的顶会论文。
3.  **引用格式**：使用 (Author, Year) 格式嵌入引用。每条论据后已标注了对应的引用标记，请在正文中原样使用。
    - 例如: (Smith, 2020) 或 (Smith and Jones, 2020) 或 (Smith et al., 2020)
    - 同一处多篇引用用分号: (Smith, 2020; Jones, 2021)
4.  **零幻觉引用**：你绝对不能捏造不存在的引用。只能使用论点后附带的引用标记。如果某个论点没有引用标记，你可以作为一般性陈述写出，但不要乱加 (Author, Year)。
5.  **输出格式**：请严格返回一个 JSON 对象，不要包含其他解释文本。格式如下：
```json
{{
  "text": "你的正文内容，注意换行使用 \\n",
  "citation_map": {{
    "(Huston et al., 2012)": "(Huston et al., 2012)"
  }}
}}
```
注意：citation_map 只需要原样包含你真正在正文里使用到的引用标记，Key 和 Value 都可以是你插入的 "(Author, Year)" 字符串。由于后端会自动映射，你不需要返回文献的数字 ID。

【论点与证据材料】
{claims_payload}
"""

RENDER_SECTION_FROM_CLAIMS_PROMPT_EN = """
You are an expert academic writer in the field of urban design, skilled at organizing structured "claim-evidence" materials into fluent and coherent academic paragraphs.

【Task】
Write a complete, detailed, and in-depth section text based on the provided "claim-evidence" table.

【Writing Requirements (CRITICAL)】
1.  **Depth and Length**: Write this section as an **in-depth academic essay** (approx. 500-800 words), comprising 3-5 naturally flowing paragraphs. Do not just list the claims.
2.  **Coherent Academic Narrative (Connecting Sentences)**: **DO NOT** just paste the claims together like a bulleted list. You MUST use sophisticated academic language to insert **connecting sentences, transitional phrases, and background elaboration (which do not require citations)** between the claims. The text must flow logically and read like a meticulously crafted paper by a human scholar.
3.  **Citation Format**: Use (Author, Year) format for inline citations. Citation markers are attached to claims - use them exactly as provided.
    - Example: (Smith, 2020) or (Smith and Jones, 2020) or (Smith et al., 2020)
    - Multiple citations at one point: (Smith, 2020; Jones, 2021)
4.  **Zero Hallucination**: You MUST NOT fabricate citations. Only use the citation markers provided. 
5.  **Output Format**: You MUST return a strict JSON object with no additional text. Format:
```json
{{
  "text": "Your complete section text, use \\n for paragraphs",
  "citation_map": {{
    "(Author, Year)": "(Author, Year)"
  }}
}}
```

【Claims and Evidence Material】
{claims_payload}
"""

LLM_MATCH_CLAIMS_TO_PAPERS_PROMPT = """
You are an expert academic research assistant.
Your task is to match specific academic claims with the most relevant papers from a provided list.

【Claims】
{claims_list}

【Available Papers】
{papers_list}

【Task Details】
For EACH claim listed above, find the best supporting papers from the Available Papers list based on semantic relevance to the claim's core argument or the 'rag_query' provided.
- You can assign 0 to 3 papers to each claim.
- Try your best to find at least 1 paper for a claim if remotely relevant.
- Return the result strictly as a JSON list of objects matching this format:
```json
[
  {{
    "claim_id": <int>,
    "support_papers": [<int>, <int>] 
  }}
]
```
Do not include any other text except the JSON array.
"""


RELEVANCE_SCORING_PROMPT = """
You are a senior academic reviewer. Evaluate the relevance of the following paper abstract to the given research topic.

【Research Topic】
{topic}

【Paper Title】
{title}

【Abstract】
{abstract}

【Task】
Score the relevance from 0 to 10:
- 10: Perfect match, core literature for this specific topic.
- 7-9: Highly relevant, provides important context or evidence.
- 4-6: Tangentially relevant or too broad/general.
- 0-3: Irrelevant, different discipline, or purely coincidental keyword match.

Provide ONLY a JSON object:
{{
  "score": <int>,
  "reason": "<one sentence explanation in Chinese>"
}}
"""

SEARCH_QUERY_EXPANSION_PROMPT = """
You are an expert academic librarian and search specialist.
Your task is to take a research topic and a specific section title, and generate robust English search queries for academic databases (like Semantic Scholar, Crossref).

【Research Topic】
{topic}

【Section Title / Context】
{section_title}
{section_keywords}

【Task】
Generate 3 distinct search strategies, from highly specific to broad.
- Tier 1 (Specific): The exact topic and section focus (e.g. "Transit-Oriented Development" AND "pedestrian safety").
- Tier 2 (Broad): A slightly broader query if Tier 1 fails (e.g. "TOD" AND "pedestrian").
- Tier 3 (General): The broadest query capturing the core concept.

Rules:
1. ONLY USE ENGLISH, even if the input is in another language. Academic databases are overwhelmingly English. Ensure accurate academic translation.
2. Keep queries VERY concise. Databases fail on long phrases. Use simple boolean format implicitly (just space-separated keywords/phrases).
3. Do not use complex operators like OR, NOT. Just the most critical keywords. Max 4 words per query.

Provide ONLY a JSON object in this exact format:
{{
  "tier1": "most specific english keywords",
  "tier2": "broader english keywords",
  "tier3": "broadest english keywords"
}}
"""

# ========== 端到端编排管线 ==========


ORCHESTRATE_FRAMEWORK_PROMPT = """
You are a senior academic researcher skilled at planning structured literature review frameworks.

【Task】
Based on the given research topic and keywords, generate a structured LITERATURE REVIEW outline.
IMPORTANT: This is a literature review paper outline, NOT a PhD research plan or project timeline.
The outline should organize existing research into thematic sections for critical analysis.

【Research Topic】
{topic}

【Keywords】
{keywords}

{custom_instructions}

【Output Requirements】
1.  Output strictly in the JSON format below, with no additional text.
2.  The framework should contain 3-6 sections covering: introduction/background, core topic literature themes, methods/techniques review, discussion and research gaps.
3.  Each section must include:
    - `id`: 章节编号，如 "1", "2.1"
    - `title`: 章节标题
    - `description`: 该章节应涵盖的内容简要描述
    - `search_keywords`: 一个包含 2-5 个英文检索关键词的列表，用于在文献数据库中检索相关文献
4.  search_keywords 应精准、简洁，适合学术数据库检索。
5.  用 {language} 语言输出标题和描述。

【JSON 输出格式】
```json
{{
  "title": "综述标题",
  "abstract_description": "综述摘要描述（2-3句话概括综述范围）",
  "sections": [
    {{
      "id": "1",
      "title": "引言：...",
      "description": "本章节介绍...",
      "search_keywords": ["keyword1", "keyword2", "keyword3"]
    }},
    {{
      "id": "2",
      "title": "...",
      "description": "...",
      "search_keywords": ["keyword1", "keyword2"]
    }}
  ]
}}
```
"""

ORCHESTRATE_SECTION_PROMPT_ZH = """
你是一位精通学术写作的研究者，擅长基于文献资料撰写连贯的学术综述章节。

【任务】
根据给定的章节标题、描述和相关文献信息，撰写该章节的综述正文。

【章节信息】
- 标题: {section_title}
- 描述: {section_description}

【可引用的文献列表】
{papers_context}

【引用规范（极其重要，务必严格遵守）】
1.  使用 (第一作者姓氏, 年份) 格式嵌入引用标注，例如:
    - 单作者: (Smith, 2020)
    - 双作者: (Smith & Jones, 2020)
    - 三人及以上: (Smith et al., 2020)
2.  同一处多篇引用用分号分隔: (Smith, 2020; Jones, 2021)
3.  你只能引用上方【可引用的文献列表】中存在的文献，绝不引用未提供的文献。
4.  每个引用标记必须与文献列表中的某篇文献精确对应。

【写作要求】
1.  严格基于提供的文献信息撰写，不要虚构文献或信息。
2.  行文应逻辑清晰、学术性强、段落之间自然过渡。
3.  每段应引用至少 2-3 篇文献来支撑论述。
4.  仅输出章节正文（Markdown 格式），不要输出章节标题、前言或额外说明。
5.  综述长度应在 300-600 字之间（中文）。
"""

ORCHESTRATE_SECTION_PROMPT_EN = """
You are an expert academic researcher skilled at writing coherent literature review sections based on provided references.

【Task】
Write a review section based on the given section title, description, and relevant literature.

【Section Information】
- Title: {section_title}
- Description: {section_description}

【Available References】
{papers_context}

【Citation Rules (CRITICAL — must follow strictly)】
1.  Use (First Author Surname, Year) format for inline citations, e.g.:
    - Single author: (Smith, 2020)
    - Two authors: (Smith & Jones, 2020)
    - Three or more: (Smith et al., 2020)
2.  Multiple citations at the same point: (Smith, 2020; Jones, 2021)
3.  Only cite papers from the 【Available References】 list above. Never cite papers not provided.
4.  Each citation must precisely correspond to a paper in the list.

【Writing Requirements】
1.  Base your writing strictly on the provided literature. Do not fabricate references or information.
2.  Write with clear logic, academic rigor, and natural transitions between paragraphs.
3.  Each paragraph should cite at least 2-3 papers to support the discussion.
4.  Output section body text only (Markdown format). Do not include section titles, preambles, or extra explanations.
5.  The section should be 200-500 words in length (English).
"""