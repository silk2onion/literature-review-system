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
    """综述基础模型"""
    title: str = Field(..., description="综述标题")
    keywords: List[str] = Field(..., description="关键词列表", min_length=1)
    framework: Optional[str] = Field(default=None, description="综述框架/大纲")
    content: Optional[str] = Field(default=None, description="综述内容")


class ReviewCreate(ReviewBase):
    """创建综述的请求模型"""
    paper_ids: Optional[List[int]] = Field(default=None, description="关联的文献ID列表")


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
    paper_limit: int = Field(default=20, ge=5, le=100, description="使用的文献数量限制")
    sources: List[str] = Field(
        default=["arxiv"],
        description="文献数据源"
    )
    year_from: Optional[int] = Field(default=None, description="起始年份")
    year_to: Optional[int] = Field(default=None, description="结束年份")
    framework_only: bool = Field(default=False, description="是否只生成框架")
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