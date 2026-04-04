"""
Review相关的Pydantic schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class ReviewStatus(str, Enum):
    """综述状态枚举"""
    DRAFT = "draft"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class ReviewBase(BaseModel):
    """综述基础模型（通用字段）"""
    title: str = Field(..., description="综述标题")
    keywords: List[str] = Field(..., description="关键词列表", min_length=1)
    framework: Optional[Any] = Field(default=None, description="综述框架/大纲（可为 Markdown 字符串或结构化 JSON）")
    content: Optional[str] = Field(default=None, description="完整综述内容（可为 Markdown）")


class ReviewCreate(ReviewBase):
    """
    创建综述的请求模型

    用法 1：基于已有本地文献库
    - paper_ids: 本地 Paper.id 列表，后端会基于这些文献构建上下文并调用 LLM

    用法 2：占位/纯文本综述
    - paper_ids 为空时，允许用户仅指定标题和 keywords，后续再绑定文献
    """
    paper_ids: Optional[List[int]] = Field(
        default=None,
        description="关联的本地文献 Paper.id 列表；为空时表示先创建空壳综述"
    )

class ReviewUpdate(BaseModel):
    """更新综述的请求模型"""
    title: Optional[str] = None
    keywords: Optional[List[str]] = None
    framework: Optional[str] = None
    content: Optional[str] = None
    status: Optional[ReviewStatus] = None


class ReviewResponse(ReviewBase):
    """综述响应模型"""
    id: int
    abstract: Optional[str] = Field(default=None, description="综述摘要")
    conclusion: Optional[str] = Field(default=None, description="综述结论（独立字段）")
    references_json: Optional[Dict[str, Any]] = Field(
        default=None,
        description="结构化参考文献 {style, items: [{paper_id, citation_key, formatted, raw}]}"
    )
    status: ReviewStatus
    paper_count: int = Field(default=0, description="关联的文献数量")
    # 与模型 Review.analysis_json 对应：结构化分析数据（timeline/topics等）
    analysis_json: Optional[Dict[str, Any]] = Field(
        default=None,
        description="结构化分析数据，例如 timeline / topics，与 LLM 结构化输出对应"
    )
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ReviewSectionsUpdate(BaseModel):
    """
    PATCH /{review_id}/sections 请求体。
    用于独立编辑摘要、结论、参考文献等字段。
    所有字段均可选——仅传入需要修改的部分。
    """
    abstract: Optional[str] = Field(default=None, description="综述摘要")
    conclusion: Optional[str] = Field(default=None, description="综述结论")
    references_json: Optional[Dict[str, Any]] = Field(
        default=None,
        description="结构化参考文献 JSON"
    )


class ReviewPaperInfo(BaseModel):
    """导出时使用的文献信息（精简版）"""
    id: int
    title: str
    authors: Optional[List[str]] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    arxiv_id: Optional[str] = None
    doi: Optional[str] = None
    pdf_url: Optional[str] = None
    abs_url: Optional[str] = None

    class Config:
        from_attributes = True


class ReviewFullExport(BaseModel):
    """导出完整综述：综述元信息 + 文献JSON + markdown结果"""
    review: ReviewResponse
    papers: List[ReviewPaperInfo]
    markdown: str
    # 预留给前端可视化使用的分析数据（例如 timeline / topics）
    analysis: Optional[Dict[str, Any]] = None


# === LLM 结构化输出 schema ===

class TimelinePoint(BaseModel):
    """时间线上的一个时间段与主题统计"""
    period: str
    topic: str
    paper_ids: List[int]


class TopicStat(BaseModel):
    """单个主题的统计信息"""
    label: str
    count: int


class LitReviewLLMResult(BaseModel):
    """
    LLM 返回的结构化综述结果:
    - markdown: 完整的综述 Markdown
    - timeline: 研究进展时间轴
    - topics: 主题统计
    """
    markdown: str
    timeline: List[TimelinePoint]
    topics: List[TopicStat]


class ReviewGenerate(BaseModel):
    """生成综述的请求模型"""
    keywords: List[str] = Field(..., description="搜索关键词", min_length=1)
    paper_ids: Optional[List[int]] = Field(
        default=None,
        description="指定使用的本地文献 ID 列表。如果提供，将忽略 sources/year_from/year_to 等搜索条件，直接使用这些文献。"
    )
    group_id: Optional[int] = Field(
        default=None,
        description="指定使用的文献分组 ID。如果提供，将使用该分组下的所有文献（受 paper_limit 限制）。"
    )
    paper_limit: int = Field(default=20, ge=5, le=500, description="使用的文献数量限制（Scoping Review 可设更高）")
    sort_by: str = Field(
        default="year_desc",
        description="文献排序策略 (仅当使用 group_id 时有效): 'year_desc' (最新), 'year_asc' (最旧), 'citations_desc' (引用最高), 'random' (随机)"
    )
    sources: List[str] = Field(
        default=["arxiv"],
        description="文献数据源。支持 'arxiv', 'scholar_serpapi', 'scopus', 'crossref'。新增支持 'local_rag' (基于本地库的语义+标签增强检索)。"
    )
    year_from: Optional[int] = Field(default=None, description="起始年份")
    year_to: Optional[int] = Field(default=None, description="结束年份")
    framework_only: bool = Field(default=False, description="是否只生成框架")
    phd_pipeline: bool = Field(
        default=False,
        description="是否启用 PhD 级多阶段综述管线（多阶段框架 + 章节级综述）",
    )
    custom_prompt: Optional[str] = Field(
        default=None,
        description="自定义提示词；如不提供则使用后端默认 PromptConfig"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "keywords": ["urban design", "sustainable cities"],
                "paper_limit": 20,
                "sources": ["arxiv"],
                "year_from": 2020,
                "framework_only": False,
                "phd_pipeline": True,
                "custom_prompt": "请重点关注城市公共空间与步行友好性研究"
            }
        }


class ReviewGenerateResponse(BaseModel):
    """生成综述的响应模型"""
    success: bool
    review_id: int
    status: ReviewStatus
    message: Optional[str] = None

    # V2 新增：直接给前端展示与可视化使用
    preview_markdown: Optional[str] = Field(
        default=None,
        description="用于前端直接渲染的 Markdown 综述文本（通常为 LLM 最新结果）"
    )
    used_prompt: Optional[str] = Field(
        default=None,
        description="本次调用实际发送给 LLM 的完整 prompt 记录"
    )
    summary_stats: Optional[Dict[str, Any]] = Field(
        default=None,
        description="用于前端绘图的统计数据，例如 timeline / topics"
    )


class ReviewExport(BaseModel):
    """导出综述的请求模型"""
    format: str = Field(..., description="导出格式: markdown, docx, pdf")
    include_references: bool = Field(default=True, description="是否包含参考文献")
    
    class Config:
        json_schema_extra = {
            "example": {
                "format": "markdown",
                "include_references": True
            }
        }


# ========== 章节级 PhD 管线：论点–证据 + RAG + 渲染 ==========
class ChunkSnippet(BaseModel):
    """
    单条 chunk 级证据片段（带页码追踪）
    - paper_id: 来源 Paper.id
    - chunk_index: chunk 在论文中的顺序索引
    - page_number: chunk 所在页码（可能为 None）
    - content: chunk 文本片段（截断至合理长度）
    - score: 语义相似度得分
    - ref_marker: 预分配的 [[REF_x:pN]] 锚定标记
    """
    paper_id: int = Field(..., description="来源 Paper ID")
    chunk_index: int = Field(default=0, description="chunk 在论文中的顺序索引")
    page_number: Optional[int] = Field(default=None, description="chunk 所在页码")
    content: str = Field(..., description="chunk 文本片段")
    score: float = Field(default=0.0, description="语义相似度得分")
    ref_marker: str = Field(default="", description="预分配的 [[REF_x:pN]] 锚定标记")


class ClaimEvidence(BaseModel):
    """
    单条论点及其检索与证据信息
    - claim_id: 在本章节内的局部编号
    - text: 论点内容（自然语言）
    - rag_query: 用于 RAG 的检索查询语句
    - support_papers: 通过 RAG 命中的 Paper.id 列表
    - support_snippets: 来自这些文献的简短片段/说明（可选）
    - chunk_snippets: chunk 级精确证据片段（含页码）
    """
    claim_id: int = Field(..., description="本章节内的论点编号，从 1 开始")
    text: str = Field(..., description="论点的自然语言描述")
    rag_query: str = Field(..., description="用于向量检索 / RAG 的查询语句")
    support_papers: List[int] = Field(default_factory=list, description="通过 RAG 命中的 Paper ID 列表")
    support_snippets: List[str] = Field(default_factory=list, description="来自文献的简短片段或说明")
    chunk_snippets: List[ChunkSnippet] = Field(default_factory=list, description="chunk 级精确证据片段（含页码和锚定标记）")
    section_id: Optional[str] = Field(default=None, description="所属章节标识（合并多章节时自动填入）")
    section_title: Optional[str] = Field(default=None, description="所属章节标题（合并多章节时自动填入）")


class SectionClaimTable(BaseModel):
    """
    某一章节下的“论点–证据表”
    - section_id: 章节的标识（可用综述内部的章节索引）
    - section_title: 章节标题
    - claims: 本章节内的所有论点行
    """
    section_id: str = Field(..., description="章节标识，例如 '1.2' 或 'methodology'")
    section_title: str = Field(..., description="章节标题")
    claims: List[ClaimEvidence] = Field(default_factory=list, description="本章节的论点–证据行")


class GenerateSectionClaimsRequest(BaseModel):
    """
    阶段 1：根据章节提纲生成 SectionClaimTable 的请求
    - review_id: 关联的综述 ID
    - section_outline: 本章节的提纲/说明
    - language: 输出语言（'zh-CN' 或 'en'）
    """
    review_id: int = Field(..., description="关联的综述 ID")
    section_outline: str = Field(..., description="章节提纲或草稿内容")
    language: str = Field(default="zh-CN", description="输出语言，例如 zh-CN 或 en")


class GenerateSectionClaimsResponse(BaseModel):
    """阶段 1 响应：返回生成的 SectionClaimTable"""
    section_claim_table: SectionClaimTable


class AttachEvidenceRequest(BaseModel):
    """
    阶段 2：为每条 claim 附加 RAG 证据的请求
    - section_claim_table: 阶段 1 的输出
    - top_k: 每条论点希望检索的文献数量
    """
    section_claim_table: SectionClaimTable
    top_k: int = Field(default=5, ge=1, le=50, description="每条论点 RAG 检索的 top_k 文献数量")


class AttachEvidenceResponse(BaseModel):
    """阶段 2 响应：返回带 support_papers / support_snippets 的 SectionClaimTable"""
    section_claim_table: SectionClaimTable


class RenderedSection(BaseModel):
    """
    阶段 3：渲染后的章节结果
    - text: 带引用标记的章节 Markdown/正文
    - citation_map: 引用标记到真实标记或Paper.id 的映射，例如 {"(Smith, 2020)": 12} 或 {"(Smith, 2020)": "(Smith, 2020)"}
    """
    text: str = Field(..., description="渲染后的章节正文（Markdown 或纯文本），包含 (Author, Year) 等引用编号")
    citation_map: Dict[str, Any] = Field(
        default_factory=dict,
        description="引用编号到 Paper.id 或原始标记 的映射"
    )


class RenderSectionFromClaimsRequest(BaseModel):
    """
    阶段 3 请求：从带证据的 SectionClaimTable 渲染章节正文
    - review_id: 关联综述 ID
    - section_claim_table: 阶段 2 输出（已附加 support_papers）
    - language: 输出语言
    - citation_start_index: 本章节引用编号起始值（跨章节时可累加）
    """
    review_id: int = Field(..., description="关联的综述 ID")
    section_claim_table: SectionClaimTable
    language: str = Field(default="zh-CN", description="输出语言，例如 zh-CN 或 en")
    citation_start_index: int = Field(default=1, ge=1, description="引用编号起始值")
    previous_sections_summary: Optional[str] = Field(default=None, description="前面章节的摘要，用于章节间连贯过渡")
    all_sections_summary: Optional[str] = Field(default=None, description="全文各章节核心发现汇总，用于讨论/结论章节")


class RenderSectionFromClaimsResponse(BaseModel):
    """阶段 3 响应：渲染后的章节与引用映射"""
    section_id: str = Field(..., description="与 SectionClaimTable 一致的章节标识")
    rendered_section: RenderedSection


class PhdPipelineInitResponse(BaseModel):
    """PhD Pipeline 初始化响应"""
    review_id: int
    claims: List[ClaimEvidence]


# ========== 端到端编排管线 ==========

class FrameworkSection(BaseModel):
    """综述框架中的单个章节"""
    id: str = Field(..., description="章节编号，如 '1', '2.1'")
    title: str = Field(..., description="章节标题")
    description: str = Field(..., description="章节描述")
    search_keywords: List[str] = Field(
        default_factory=list,
        description="用于检索文献的关键词列表"
    )


class ReviewFramework(BaseModel):
    """综述框架结构"""
    title: str = Field(..., description="综述标题")
    abstract_description: str = Field(default="", description="综述范围概述")
    sections: List[FrameworkSection] = Field(
        default_factory=list, description="章节列表"
    )


class OrchestrationRequest(BaseModel):
    """端到端编排请求"""
    topic: str = Field(..., description="研究主题", min_length=2)
    keywords: List[str] = Field(
        ..., description="研究关键词列表", min_length=1
    )
    paper_limit: int = Field(
        default=30, ge=5, le=500,
        description="每节检索的文献数量上限（Scoping Review 可设更高）"
    )
    language: str = Field(
        default="zh-CN",
        description="输出语言: 'zh-CN' 或 'en'"
    )
    citation_style: str = Field(
        default="harvard",
        description="引用格式: 'harvard' (默认), 'apa', 'ieee', 'chicago', 'vancouver'"
    )
    year_from: Optional[int] = Field(default=None, description="起始年份")
    year_to: Optional[int] = Field(default=None, description="结束年份")
    custom_instructions: Optional[str] = Field(
        default=None,
        description="自定义指令（附加到框架生成 prompt 中）"
    )
    use_local_only: bool = Field(
        default=False,
        description="是否仅使用本地已有文献（不进行在线搜索）"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "topic": "TOD与文化遗产保护",
                "keywords": ["TOD", "heritage conservation", "sustainable urban design"],
                "paper_limit": 30,
                "language": "en",
                "citation_style": "harvard",
                "year_from": 2015,
            }
        }


class SectionResult(BaseModel):
    """单节生成结果"""
    section_id: str
    section_title: str
    text: str = Field(..., description="该节综述正文（含 Author,Year 引用）")
    cited_paper_ids: List[int] = Field(
        default_factory=list,
        description="该节引用的 paper IDs"
    )


class OrchestrationResult(BaseModel):
    """端到端编排结果"""
    review_id: int
    title: str
    framework: ReviewFramework
    sections: List[SectionResult]
    full_markdown: str = Field(..., description="完整综述 Markdown（含参考文献列表）")
    references_markdown: str = Field(..., description="参考文献列表 Markdown")
    citation_map: Dict[str, Any] = Field(
        default_factory=dict,
        description="(Author, Year) → paper info 映射"
    )
    stats: Dict[str, Any] = Field(
        default_factory=dict,
        description="统计信息"
    )


# ========== Task Monitoring ==========

class PipelineTaskStep(BaseModel):
    """单步任务进度信息"""
    step: str
    label: str
    status: str
    message: str
    elapsed: Optional[float] = None
    attempt: int
    max_attempts: int


class PipelineTaskResponse(BaseModel):
    """PhD 管线任务完整状态"""
    task_id: str
    status: str
    topic: str
    created_at: str
    finished_at: Optional[str] = None
    error: Optional[str] = None
    review_id: Optional[int] = None
    full_markdown: Optional[str] = None
    references_markdown: Optional[str] = None
    total_cited_papers: int
    steps: List[PipelineTaskStep]


class PipelineTaskListResponse(BaseModel):
    """任务列表响应"""
    tasks: List[PipelineTaskResponse]