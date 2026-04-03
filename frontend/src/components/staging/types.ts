export type StagingPaper = {
  id: number;
  title: string;
  authors?: string[] | null;
  abstract?: string | null;
  year?: number | null;
  source?: string | null;
  status?: string | null;
  screening_stage?: string | null;
  exclusion_reason?: string | null;
  crawl_job_id?: number | null;
  doi?: string | null;
  arxiv_id?: string | null;
  url?: string | null;
  pdf_url?: string | null;
  llm_score?: number | null;
  llm_tags?: string[] | null;
  created_at: string;
};

export type StagingSearchRequest = {
  q?: string | null;
  status?: string | null;
  source?: string | null;
  screening_stage?: string | null;
  crawl_job_id?: number | null;
  year_from?: number | null;
  year_to?: number | null;
  page: number;
  page_size: number;
};

export type StagingSearchResponse = {
  success: boolean;
  total: number;
  items: StagingPaper[];
  message?: string | null;
};

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "accepted", label: "已提升" },
  { value: "rejected", label: "已拒绝" },
];

export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "arxiv", label: "arXiv" },
  { value: "crossref", label: "CrossRef" },
  { value: "scholar_serpapi", label: "Google Scholar" },
  { value: "scopus", label: "Scopus" },
  { value: "semantic_scholar", label: "Semantic Scholar" },
];

export const SCREENING_STAGE_OPTIONS: {
  value: string;
  label: string;
  color: string;
}[] = [
  { value: "all", label: "全部阶段", color: "#64748b" },
  { value: "identification", label: "🔍 识别", color: "#6366f1" },
  { value: "screening", label: "📋 筛选", color: "#0ea5e9" },
  { value: "eligibility", label: "✅ 资格", color: "#f59e0b" },
  { value: "included", label: "📎 纳入", color: "#22c55e" },
];
