import json as _json
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class PromptConfig(BaseModel):
    """文献综述提示词配置"""
    system_prompt: str
    user_template: str  # 包含 {{keywords}}, {{year_range}}, {{paper_summaries}} 等占位符


class PromptPreviewResponse(BaseModel):
    """用于前端预览渲染后的 Prompt 内容"""
    rendered_prompt: str


# ========================================================================
# 学科配置模型 (Discipline Profile)
# ========================================================================

class DisciplineProfile(BaseModel):
    """
    学科配置——控制综述 LLM 的学术身份和领域特化。
    通过 Agent 对话自动生成，或在 Settings 面板手动编辑。
    """
    field_name: str = Field(
        default="General Academic Research",
        description="学科/领域名称，如 'Urban Design', '量子计算', 'Biomedical Engineering'",
    )
    researcher_identity: str = Field(
        default=(
            "你是一位资深的跨学科学术研究者，"
            "擅长撰写系统性的文献综述，能够从大量论文中抽取发展脉络、研究主题与研究空白。"
        ),
        description="综述 LLM 的身份描述（用于 system_prompt 开头）",
    )
    review_system_prompt: str = Field(
        default=(
            "你是一位资深的跨学科学术研究者，"
            "擅长撰写系统性的文献综述，能够从大量论文中抽取发展脉络、研究主题与研究空白。"
        ),
        description="一键综述的完整 system_prompt",
    )
    review_user_template: str = Field(
        default=(
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
            "4. **关注期刊质量**：如果文献信息中提供了期刊分区（Q1/Q2）、影响因子或收录情况（SCI/SSCI），"
            "请优先讨论高水平期刊的论文，并在文中适当提及（例如'发表于 Q1 期刊的研究指出...'）。\n\n"
            "在 Markdown 正文之后，请额外输出一个 JSON 代码块，格式示意如下（注意保持合法 JSON）：\n"
            "```json\n"
            "{\n"
            '  "timeline": [\n'
            '    {"period": "2010-2013", "topic": "早期研究探索", "paper_ids": [1, 3, 5]},\n'
            '    {"period": "2014-2017", "topic": "方法论成熟期", "paper_ids": [2, 4]}\n'
            "  ],\n"
            '  "topics": [\n'
            '    {"label": "核心主题A", "count": 8},\n'
            '    {"label": "核心主题B", "count": 5}\n'
            "  ]\n"
            "}\n"
            "```\n"
            "其中 paper_ids 需对应你在综述中重点讨论的文献编号或内部索引。"
        ),
        description="一键综述的 user 模板（含 {{keywords}} 等占位符）",
    )
    example_timeline_topics: List[str] = Field(
        default_factory=lambda: ["早期研究探索", "方法论成熟期"],
        description="JSON 示例中的时间线主题词（帮 LLM 生成更贴合学科的时间线）",
    )
    example_theme_labels: List[str] = Field(
        default_factory=lambda: ["核心主题A", "核心主题B"],
        description="JSON 示例中的主题标签（帮 LLM 生成更贴合学科的主题分类）",
    )
    claims_system_prompt: str = Field(
        default=(
            "你是一位资深的{field_name}领域学术研究者，"
            "擅长将章节草稿拆解为结构化的'论点–证据'表。"
        ),
        description="Claims 生成的 system_prompt（支持 {field_name} 占位符）",
    )
    framework_system_prompt: str = Field(
        default=(
            "You are an expert academic researcher. Your task is to generate a LITERATURE REVIEW outline "
            "(not a PhD research plan or timeline). The outline should contain 3-6 sections covering: "
            "introduction, core topic literature analysis, methods/techniques review, discussion and research gaps. "
            "Each section should include search_keywords for finding relevant papers in academic databases."
        ),
        description="框架生成的 system_prompt",
    )
    section_system_prompt: str = Field(
        default=(
            "你是一位精通学术写作的研究者，擅长撰写高质量的学术综述。"
        ),
        description="章节写作的 system_prompt",
    )


# ── 默认通用学术配置 ──────────────────────────────────────

DEFAULT_DISCIPLINE_PROFILE = DisciplineProfile()


def get_discipline_profile(db) -> DisciplineProfile:
    """
    从数据库 SystemSetting 读取学科配置。
    Fallback 链：DB → DEFAULT_DISCIPLINE_PROFILE
    """
    try:
        from app.models.system_setting import SystemSetting
        row = db.query(SystemSetting).filter(
            SystemSetting.key == "discipline_profile"
        ).first()
        if row and row.value:
            data = _json.loads(row.value) if isinstance(row.value, str) else row.value
            return DisciplineProfile(**data)
    except Exception as e:
        logger.warning("Failed to load discipline profile from DB: %s", e)
    return DEFAULT_DISCIPLINE_PROFILE


def save_discipline_profile(db, profile: DisciplineProfile) -> None:
    """将学科配置写入 SystemSetting"""
    from app.models.system_setting import SystemSetting
    row = db.query(SystemSetting).filter(
        SystemSetting.key == "discipline_profile"
    ).first()
    value_str = _json.dumps(profile.model_dump(), ensure_ascii=False)
    if row:
        row.value = value_str
    else:
        db.add(SystemSetting(key="discipline_profile", value=value_str))
    db.commit()


def build_lit_review_prompt(db) -> PromptConfig:
    """
    动态构建 PromptConfig——从 DisciplineProfile 读取 system_prompt 和 user_template。
    替代原来的静态 DEFAULT_LIT_REVIEW_PROMPT_CONFIG。
    """
    profile = get_discipline_profile(db)
    return PromptConfig(
        system_prompt=profile.review_system_prompt,
        user_template=profile.review_user_template,
    )


def get_claims_system_prompt(db) -> str:
    """获取 Claims 阶段的 system_prompt，自动替换 {field_name}"""
    profile = get_discipline_profile(db)
    return profile.claims_system_prompt.replace(
        "{field_name}", profile.field_name
    )


def get_framework_system_prompt(db) -> str:
    """获取框架生成阶段的 system_prompt"""
    profile = get_discipline_profile(db)
    return profile.framework_system_prompt


def get_section_system_prompt(db) -> str:
    """获取章节写作阶段的 system_prompt"""
    profile = get_discipline_profile(db)
    return profile.section_system_prompt


# ── 保留静态引用供无 DB 场景 fallback ──────────────────────
DEFAULT_LIT_REVIEW_PROMPT_CONFIG = PromptConfig(
    system_prompt=DEFAULT_DISCIPLINE_PROFILE.review_system_prompt,
    user_template=DEFAULT_DISCIPLINE_PROFILE.review_user_template,
)


# ========================================================================
# 章节级 PhD 管线：论点–证据 + RAG + 渲染  (v2 — [[REF_x]] Anchoring)
# ========================================================================

GENERATE_SECTION_CLAIMS_PROMPT = """
你是一位资深学术研究者，擅长将综述框架拆解为结构化的"论点–证据"表。

【任务】
根据给定的"章节提纲"，为每个章节生成详尽的论点列表。每个论点将在后续被RAG系统匹配到具体文献支撑。

【章节提纲】
{section_outline}

【输出要求】
1.  严格按照以下 JSON 格式输出，不要添加任何额外说明。
2.  如果提纲包含多个章节，请输出一个包含所有章节的**JSON数组**。
3.  每个章节生成 **5-10 条论点**（不要少于5条），覆盖以下维度：
    - 该领域的发展历史与里程碑
    - 关键理论框架与概念模型
    - 主要研究方法与技术路径
    - 代表性研究成果与核心发现
    - 研究局限与尚待解决的问题（research gap）
    - 不同研究之间的关系（互补、矛盾、继承）
4.  每条 `ClaimEvidence` 必须包含：
    - `claim_id`: 从 1 开始的全局整数编号（跨章节递增）。
    - `text`: 论点的自然语言陈述句，应具体、可验证、有学术深度。
    - `rag_query`: 一个精确的英文学术检索短语（3-8个词），用于在文献数据库中进行向量检索（RAG）。
    - `section_id`: 该论点所属的章节ID。
    - `section_title`: 该论点所属的章节标题。

【JSON 输出格式示例】
```json
[
  {{
    "section_id": "1",
    "section_title": "引言：TOD研究的背景与演进",
    "claims": [
      {{
        "claim_id": 1,
        "text": "公交导向开发（TOD）的概念最早由Peter Calthorpe于1993年系统提出，其核心理念是围绕公共交通站点进行高密度、混合功能的社区规划。",
        "rag_query": "Transit-Oriented Development Calthorpe origin concept",
        "section_id": "1",
        "section_title": "引言：TOD研究的背景与演进"
      }},
      {{
        "claim_id": 2,
        "text": "随着全球城市化进程加速和气候变化议题升温，TOD被视为实现可持续城市交通与土地利用的关键策略。",
        "rag_query": "TOD sustainable urban development climate change",
        "section_id": "1",
        "section_title": "引言：TOD研究的背景与演进"
      }}
    ]
  }},
  {{
    "section_id": "2",
    "section_title": "TOD评估方法与指标体系",
    "claims": [
      {{
        "claim_id": 3,
        "text": "Cervero和Kockelman提出的3D模型（Density, Diversity, Design）是TOD效能评估的经典框架。",
        "rag_query": "Cervero Kockelman 3D density diversity design TOD",
        "section_id": "2",
        "section_title": "TOD评估方法与指标体系"
      }}
    ]
  }}
]
```
"""

RENDER_SECTION_FROM_CLAIMS_PROMPT_ZH = """
你是一位精通学术写作的资深研究者，擅长将结构化的"论点–证据"材料转化为高质量的学术综述章节。

【任务】
根据给定的"论点–证据"表（包含每条论点及其支撑文献），撰写一段**完整、深度、专业**的学术综述章节正文。

【写作规范（极其重要，必须严格遵守）】

**1. 篇幅要求**
- 每个章节必须写 **800-1500 字**（中文），包含 **4-8 个**逻辑延展的自然段。
- 绝不接受少于 600 字的章节输出。如果论点较少，应通过深入展开讨论来填充篇幅。

**2. 学术叙事结构（最核心要求）**
- **绝对禁止**把论点像条目清单一样罗列。你必须写出连贯的学术叙事文。
- 每段应有明确的主题句（Topic Sentence），随后展开论证和文献支撑。
- 段落之间必须有**过渡句**（Transitional Sentences），建立逻辑桥接：
  - 时间递进型："在此基础上，后续研究进一步..."、"进入21世纪后..."
  - 对比转折型："然而，并非所有学者都持相同观点。"、"与此不同的是..."
  - 因果推进型："这一发现促使研究者重新审视..."、"正因如此..."
  - 总分展开型："具体而言，上述框架可从以下三个维度展开讨论..."
- 每段的**最后一句**应自然引出下一段的主题。
- **鼓励综合论述**：将多篇文献的发现放在同一个观点下讨论，而不是每篇文献独占一段。

**3. 引用格式 — [[REF_x]] 锚定系统**
- 每条论据已标注了 `[[REF_x]]` 格式的引用占位符（x 为数据库中文献的内部ID）。
- 在正文中必须**原样使用**这些占位符，示例：
  - 句尾引用："...的研究指出了这一趋势 [[REF_42]]。"
  - 多篇引用："多项研究证实了这一发现 [[REF_42]] [[REF_78]] [[REF_103]]。"
  - 叙述性引用："[[REF_42]] 的研究首次提出了该框架，随后 [[REF_78]] 对其进行了拓展。"
- **零幻觉规则**：绝不捏造不存在的引用。只使用论据中附带的 [[REF_x]] 标记。如果某个论点没有引用标记，你可以作为一般性学术陈述写出，但不要凭空添加任何 [[REF_x]]。

**4. 输出格式**
请严格返回一个 JSON 对象，不要包含其他解释文本。格式如下：
```json
{{
  "text": "你的正文内容，段落之间使用 \\n\\n 分隔",
  "citation_map": {{
    "[[REF_42]]": 42,
    "[[REF_78]]": 78
  }}
}}
```
注意：citation_map 中 Key 是你在正文里使用的 `[[REF_x]]` 标记，Value 是对应的文献数据库 ID（整数）。只包含你**实际在正文中使用**的引用。

【论点与证据材料】
{claims_payload}
"""

RENDER_SECTION_FROM_CLAIMS_PROMPT_EN = """
You are an expert academic writer skilled at transforming structured "claim-evidence" materials into high-quality literature review sections.

【Task】
Write a **complete, in-depth, and professional** academic review section based on the provided "claim-evidence" table.

【Writing Standards (CRITICAL — must follow strictly)】

**1. Length Requirements**
- Each section MUST be **800-1500 words** (English), comprising **4-8** logically developed natural paragraphs.
- Outputs shorter than 600 words are unacceptable. If claims are few, deepen the discussion to fill the length.

**2. Academic Narrative Structure (Most Critical Requirement)**
- **ABSOLUTELY FORBIDDEN** to list claims like bullet points. You MUST produce a connected academic narrative.
- Each paragraph should have a clear Topic Sentence, followed by evidence and argumentation.
- Paragraphs MUST be connected by **transitional sentences** that build logical bridges:
  - Temporal progression: "Building upon this foundation, subsequent studies further..."
  - Contrastive: "However, not all scholars share this perspective."
  - Causal: "This finding prompted researchers to reconsider..."
  - Elaborative: "Specifically, the aforementioned framework can be examined from three dimensions..."
- The **last sentence** of each paragraph should naturally introduce the next paragraph's theme.
- **Encourage synthesis**: Discuss findings from multiple papers under a single argument rather than giving each paper its own paragraph.

**3. Citation Format — [[REF_x]] Anchoring System**
- Each claim has `[[REF_x]]` citation placeholders attached (x = internal database paper ID).
- You MUST use these placeholders **exactly as provided** in the body text:
  - End-of-sentence: "...research identified this trend [[REF_42]]."
  - Multiple: "Several studies confirmed this finding [[REF_42]] [[REF_78]] [[REF_103]]."
  - Narrative: "[[REF_42]] first proposed this framework, which [[REF_78]] subsequently extended."
- **Zero Hallucination Rule**: NEVER fabricate citations. Only use [[REF_x]] markers attached to the claims. If a claim has no citation markers, write it as a general academic statement without adding any [[REF_x]].

**4. Output Format**
Return a strict JSON object with no additional text:
```json
{{
  "text": "Your complete section text, use \\n\\n between paragraphs",
  "citation_map": {{
    "[[REF_42]]": 42,
    "[[REF_78]]": 78
  }}
}}
```
Note: citation_map keys are `[[REF_x]]` markers used in the text, values are integer paper database IDs. Only include citations **actually used** in the text.

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

# ========================================================================
# 端到端编排管线 (v2 — 增强框架 + [[REF_x]] Anchoring)
# ========================================================================

ORCHESTRATE_FRAMEWORK_PROMPT = """
You are a senior academic researcher skilled at planning structured literature review frameworks for PhD-level research.

【Task】
Based on the given research topic and keywords, generate a comprehensive LITERATURE REVIEW outline.
IMPORTANT: This is a literature review paper outline, NOT a PhD research plan or project timeline.
The outline should organize existing research into thematic sections for critical analysis.

【Research Topic】
{topic}

【Keywords】
{keywords}

{custom_instructions}

【Output Requirements】
1.  Output strictly in the JSON format below, with no additional text.
2.  The framework MUST contain **4-7 sections** with the following structure:
    - Section 1: **Introduction / Background** — Historical context, problem motivation, scope of review
    - Sections 2-5: **Core thematic literature analysis** — Each section focuses on one major theme or research stream. Organize by THEME, not chronology.
    - Second-to-last section: **Research Methods & Techniques Review** — Common methodologies, data sources, analytical frameworks used in the literature
    - Last section: **Research Gaps, Limitations & Future Directions** — What remains unknown? What are the contradictions? Where should future research focus?
3.  Each section must include:
    - `id`: Section number, e.g. "1", "2", "3"
    - `title`: Section title (descriptive, academic)
    - `description`: A **detailed 3-5 sentence description** of what this section should cover, including: the specific subtopics, the expected analytical angle, and what kind of literature supports it. This description is critical because it guides the subsequent content generation.
    - `search_keywords`: A list of **3-5 precise English search keywords/phrases** for academic database retrieval. These should be real academic terms that will find relevant papers on Semantic Scholar/Scopus/CrossRef.
    - `expected_themes`: A list of **2-4 key themes or debates** that should be discussed in this section.
4.  Use {language} for titles and descriptions.

【JSON Output Format】
```json
{{
  "title": "综述标题 (should be specific and academic)",
  "abstract_description": "综述摘要描述（3-5句话，概括综述范围、核心问题、预期贡献）",
  "sections": [
    {{
      "id": "1",
      "title": "引言：研究背景与问题界定",
      "description": "本章节首先回顾XX领域的发展历程，从XX的提出到XX的演变。随后界定本综述的研究范围，明确核心研究问题。最后概述全文的章节组织结构。",
      "search_keywords": ["keyword1 keyword2", "keyword3 keyword4", "keyword5"],
      "expected_themes": ["theme1", "theme2"]
    }},
    {{
      "id": "2",
      "title": "...",
      "description": "...",
      "search_keywords": ["keyword1", "keyword2"],
      "expected_themes": ["theme1", "theme2", "theme3"]
    }}
  ]
}}
```
"""

ORCHESTRATE_SECTION_PROMPT_ZH = """
你是一位精通学术写作的资深研究者，擅长基于文献资料撰写深度的学术综述章节。你的任务是写出一篇可以直接放入PhD论文的高质量综述章节。

【任务】
根据给定的章节标题、描述和相关文献信息，撰写该章节的综述正文。

【章节信息】
- 标题: {section_title}
- 描述: {section_description}

【可引用的文献列表】
以下每篇文献都有一个唯一的 [[REF_x]] 标记（x为数据库ID），请在正文中使用这些标记进行引用。
{papers_context}

【写作规范（极其重要，必须严格遵守）】

**1. 篇幅要求**
- 本章节必须写 **800-1500 字**（中文），包含 **4-8 个**逻辑延展的自然段。
- 绝不接受少于 600 字的章节输出。

**2. 学术叙事结构**
- **绝对禁止**把文献像条目清单一样罗列。你必须写出连贯的学术叙事文。
- 每段应有明确的主题句（Topic Sentence），随后展开论证。
- 段落之间必须有过渡句，建立逻辑桥接。
- **鼓励综合论述**：将多篇文献的发现放在同一个论点下讨论，展示它们之间的关系（互补、矛盾、继承、发展）。
- 最后一段应总结本节的关键发现，并指出研究空白或未解决的问题。

**3. 内容深度要求**
- 不要仅停留在"谁做了什么"的表面描述。要深入分析：
  - 不同研究之间的方法论差异和各自的局限性
  - 研究发现的一致性和矛盾之处
  - 理论框架的演变脉络
  - 研究空白（research gap）和潜在的未来方向

**4. 引用格式 — [[REF_x]] 锚定系统**
- 文献列表中每篇文献都标注了 `[[REF_x]]` 格式的引用占位符。
- 在正文中必须**原样使用**这些占位符：
  - 句尾引用："...的研究指出了这一趋势 [[REF_42]]。"
  - 多篇引用："多项研究证实了这一发现 [[REF_42]] [[REF_78]]。"
  - 叙述性引用："[[REF_42]] 首次提出了该框架。"
- **零幻觉规则**：绝不捏造引用。只使用文献列表中存在的 [[REF_x]] 标记。
- 每段应引用至少 2-3 篇文献。

**5. 输出格式**
- 仅输出章节正文（Markdown 格式），不要输出章节标题、前言或额外说明。
- 正文就是纯粹的段落文本，直接开始写第一段。
"""

ORCHESTRATE_SECTION_PROMPT_EN = """
You are an expert academic researcher skilled at writing in-depth, PhD-quality literature review sections. Your task is to produce a section that could be directly inserted into a PhD thesis.

【Task】
Write a review section based on the given section title, description, and relevant literature.

【Section Information】
- Title: {section_title}
- Description: {section_description}

【Available References】
Each paper below has a unique [[REF_x]] marker (x = database ID). Use these markers for inline citations in your text.
{papers_context}

【Writing Standards (CRITICAL — must follow strictly)】

**1. Length Requirements**
- This section MUST be **800-1500 words** (English), comprising **4-8** logically developed natural paragraphs.
- Outputs shorter than 600 words are unacceptable.

**2. Academic Narrative Structure**
- **ABSOLUTELY FORBIDDEN** to list papers like bullet points. Produce a connected academic narrative.
- Each paragraph: clear Topic Sentence → evidence and argumentation → transition to next paragraph.
- **Encourage synthesis**: Discuss findings from multiple papers under one argument, showing their relationships (complementary, contradictory, evolutionary).
- The final paragraph should summarize key findings and identify research gaps.

**3. Content Depth**
- Go beyond surface-level "who did what" descriptions. Analyze:
  - Methodological differences and limitations across studies
  - Consistencies and contradictions in findings
  - Evolution of theoretical frameworks
  - Research gaps and potential future directions

**4. Citation Format — [[REF_x]] Anchoring System**
- Each paper in the references list has a `[[REF_x]]` placeholder.
- Use these placeholders **exactly as provided**:
  - End-of-sentence: "...research identified this trend [[REF_42]]."
  - Multiple: "Several studies confirmed this [[REF_42]] [[REF_78]]."
  - Narrative: "[[REF_42]] first proposed this framework."
- **Zero Hallucination Rule**: NEVER fabricate citations. Only use [[REF_x]] markers from the reference list.
- Each paragraph should cite at least 2-3 papers.

**5. Output Format**
- Output section body text ONLY (Markdown format). No section titles, preambles, or extra explanations.
- Start directly with the first paragraph of prose.
"""

# ========================================================================
# Abstract & Conclusion 自动生成 Prompts
# ========================================================================

GENERATE_ABSTRACT_PROMPT_ZH = """
你是一位精通学术写作的资深研究者。

【任务】
基于以下完整的文献综述正文，撰写一篇结构化的学术摘要（Abstract）。

【综述正文】
{review_content}

【写作规范】
1. 摘要长度：**200-350 字**（中文），结构紧凑、信息密度高。
2. 必须覆盖以下要素（按顺序）：
   - **研究背景与动机**（1-2句）：该领域的核心问题是什么？为什么需要这篇综述？
   - **综述范围与方法**（1句）：本综述覆盖了哪些方面？采用了什么分析视角？
   - **核心发现**（2-3句）：综述揭示了哪些关键趋势、共识或争论？
   - **研究空白与展望**（1-2句）：尚存哪些未解决的问题？未来方向是什么？
3. 不要使用"本文"、"本综述"等第一人称表述，改用"该综述"或被动语态。
4. 不要包含具体的文献引用标记（如 [[REF_x]] 或 (Author, Year)）。
5. 语言精练、学术化，避免口语化表达。

【输出格式】
仅输出摘要正文，不要添加"摘要"标题或其他说明。
"""

GENERATE_ABSTRACT_PROMPT_EN = """
You are an expert academic writer.

【Task】
Write a structured academic abstract based on the following complete literature review.

【Review Content】
{review_content}

【Writing Standards】
1. Abstract length: **200-350 words** (English), compact and information-dense.
2. Must cover these elements (in order):
   - **Background & Motivation** (1-2 sentences): What is the core problem? Why is this review needed?
   - **Scope & Method** (1 sentence): What does this review cover? What analytical lens is used?
   - **Key Findings** (2-3 sentences): What key trends, consensus, or debates does the review reveal?
   - **Gaps & Future Directions** (1-2 sentences): What remains unresolved? Where should future research focus?
3. Do NOT use first-person ("this paper", "we"). Use "this review" or passive voice.
4. Do NOT include citation markers (e.g., [[REF_x]] or (Author, Year)).
5. Language should be precise, academic, and free of colloquialisms.

【Output Format】
Output the abstract text ONLY. No "Abstract" heading or extra explanations.
"""

GENERATE_CONCLUSION_PROMPT_ZH = """
你是一位精通学术写作的资深研究者。

【任务】
基于以下完整的文献综述正文，撰写一段全面的结论章节（Conclusion）。

【综述正文】
{review_content}

【写作规范】
1. 结论长度：**400-800 字**（中文），包含 **3-5 个**自然段。
2. 必须覆盖以下要素：
   - **第一段：综述总结**——概括本综述的核心研究问题、覆盖范围和主要分析维度。
   - **第二段：关键发现提炼**——总结各章节的核心发现，提炼出最重要的 3-5 条结论性观点。注意是高度概括而非重复正文内容。
   - **第三段：研究局限与反思**——指出本综述的方法论局限（如文献来源范围、时间跨度、语言偏差等），以及现有研究的共性不足。
   - **第四段：未来研究方向**——基于文献中识别的研究空白，提出 3-5 个具体的、可操作的未来研究方向。每个方向应说明为什么重要以及可能的研究路径。
   - **（可选）第五段：实践意义**——如果适用，讨论研究发现对实践或政策的启示。
3. 段落之间使用过渡句衔接，保持逻辑连贯性。
4. 不要使用具体的引用标记。结论应是对全文的高度概括性论述。
5. 语言应当有总结性和前瞻性，体现学术深度。

【输出格式】
仅输出结论正文（Markdown 格式），不要输出"结论"标题或其他说明。段落之间使用 \\n\\n 分隔。
"""

GENERATE_CONCLUSION_PROMPT_EN = """
You are an expert academic writer.

【Task】
Write a comprehensive conclusion section based on the following complete literature review.

【Review Content】
{review_content}

【Writing Standards】
1. Conclusion length: **400-800 words** (English), comprising **3-5** natural paragraphs.
2. Must cover these elements:
   - **Paragraph 1: Review Summary** — Recap the core research questions, scope, and main analytical dimensions.
   - **Paragraph 2: Key Findings** — Synthesize the most important 3-5 conclusive insights from across all sections. Highly abstracted, not repetitive.
   - **Paragraph 3: Limitations & Reflections** — Note methodological limitations of this review (scope, time range, language bias) and common shortcomings in existing research.
   - **Paragraph 4: Future Research Directions** — Based on identified gaps, propose 3-5 specific, actionable future research directions. Explain why each matters and possible approaches.
   - **(Optional) Paragraph 5: Practical Implications** — If applicable, discuss implications for practice or policy.
3. Use transitional sentences between paragraphs to maintain logical coherence.
4. Do NOT use specific citation markers. The conclusion should be a high-level synthesis.
5. Language should be summative and forward-looking, demonstrating academic depth.

【Output Format】
Output conclusion body text ONLY (Markdown format). No "Conclusion" heading or extra explanations. Use \\n\\n between paragraphs.
"""