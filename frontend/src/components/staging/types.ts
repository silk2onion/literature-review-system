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
  journal?: string | null;
  citations_count?: number | null;
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

export const STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "all", labelKey: "staging.status.all" },
  { value: "pending", labelKey: "staging.status.pending" },
  { value: "accepted", labelKey: "staging.status.accepted" },
  { value: "rejected", labelKey: "staging.status.rejected" },
];

export const SOURCE_OPTIONS: { value: string; labelKey?: string; label?: string }[] = [
  { value: "all", labelKey: "staging.source.all" },
  { value: "arxiv", label: "arXiv" },
  { value: "crossref", label: "CrossRef" },
  { value: "scholar_serpapi", label: "Google Scholar" },
  { value: "scopus", label: "Scopus" },
  { value: "semantic_scholar", label: "Semantic Scholar" },
];

export const SCREENING_STAGE_OPTIONS: {
  value: string;
  labelKey: string;
  color: string;
}[] = [
  { value: "all", labelKey: "staging.screeningStage.all", color: "#64748b" },
  { value: "identification", labelKey: "staging.screeningStage.identification", color: "#6366f1" },
  { value: "screening", labelKey: "staging.screeningStage.screening", color: "#0ea5e9" },
  { value: "eligibility", labelKey: "staging.screeningStage.eligibility", color: "#f59e0b" },
  { value: "included", labelKey: "staging.screeningStage.included", color: "#22c55e" },
];
