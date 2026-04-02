import { apiGet, apiPost, apiDelete } from "./http";

export interface StagingSearchRequest {
  q?: string | null;
  status?: string | null;
  source?: string | null;
  screening_stage?: string | null;
  crawl_job_id?: number | null;
  year_from?: number | null;
  year_to?: number | null;
  page: number;
  page_size: number;
}

export interface StagingPaper {
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
  created_at: string;
}

export interface StagingSearchResponse {
  success: boolean;
  total: number;
  items: StagingPaper[];
  message?: string | null;
}

export const stagingApi = {
  search(params: StagingSearchRequest, signal?: AbortSignal) {
    return apiPost<StagingSearchResponse>("/api/staging-papers/search", params, signal);
  },

  promote(params: { ids: number[] }) {
    return apiPost<unknown[]>("/api/staging-papers/promote", params);
  },

  delete(id: number) {
    return apiDelete<{ deleted_count: number }>(`/api/staging-papers/${id}`);
  },

  updateScreening(params: {
    ids: number[];
    exclusion_reason?: string;
  }) {
    return apiPost<{ rejected_count: number }>(
      "/api/staging-papers/reject",
      params,
    );
  },

  batchUpdateScreening(params: {
    ids: number[];
    exclusion_reason?: string;
  }) {
    return apiPost<{ rejected_count: number }>(
      "/api/staging-papers/reject",
      params,
    );
  },

  batchDelete(params: { ids: number[] }) {
    return apiPost<{ deleted_count: number }>(
      "/api/staging-papers/delete",
      params,
    );
  },

  prismaStats(crawlJobId?: number) {
    const path = crawlJobId
      ? `/api/staging-papers/prisma-stats?crawl_job_id=${crawlJobId}`
      : "/api/staging-papers/prisma-stats";
    return apiGet<Record<string, unknown>>(path);
  },
};
