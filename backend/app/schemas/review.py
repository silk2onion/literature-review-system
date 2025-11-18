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
    framework: Optional[str] = Field(default=None, description="综述框架/大纲（整体大纲，Markdown 或结构化文本）")
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
    paper_limit: int = Field(default=20, ge=5, le=100, description="使用的文献数量限制")
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
class ClaimEvidence(BaseModel):
    """
    单条论点及其检索与证据信息
    - claim_id: 在本章节内的局部编号
    - text: 论点内容（自然语言）
    - rag_query: 用于 RAG 的检索查询语句
    - support_papers: 通过 RAG 命中的 Paper.id 列表
    - support_snippets: 来自这些文献的简短片段/说明（可选）
    """
    claim_id: int = Field(..., description="本章节内的论点编号，从 1 开始")
    text: str = Field(..., description="论点的自然语言描述")
    rag_query: str = Field(..., description="用于向量检索 / RAG 的查询语句")
    support_papers: List[int] = Field(default_factory=list, description="通过 RAG 命中的 Paper ID 列表")
    support_snippets: List[str] = Field(default_factory=list, description="来自文献的简短片段或说明")


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
    - text: 带引用编号的章节 Markdown/正文
    - citation_map: 引用编号到 Paper.id 的映射，例如 {1: 12, 2: 35}
    """
    text: str = Field(..., description="渲染后的章节正文（Markdown 或纯文本），包含 [1][2,3] 等引用编号")
    citation_map: Dict[int, int] = Field(
        default_factory=dict,
        description="引用编号到 Paper.id 的映射，例如 {1: 12, 2: 35}"
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


class RenderSectionFromClaimsResponse(BaseModel):
    """阶段 3 响应：渲染后的章节与引用映射"""
    section_id: str = Field(..., description="与 SectionClaimTable 一致的章节标识")
    rendered_section: RenderedSection


class PhdPipelineInitResponse(BaseModel):
    """PhD Pipeline 初始化响应"""
    review_id: int
    claims: List[ClaimEvidence]