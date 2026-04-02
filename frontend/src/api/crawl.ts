import { apiGet, apiPost } from "./http";
import type {
  CrawlJobPayload,
  CrawlJobResponse,
  CrawlJobListResponse,
} from "../types/crawl";

export const crawlApi = {
  createJob(params: CrawlJobPayload) {
    return apiPost<CrawlJobResponse>("/api/crawl/jobs", params);
  },

  listJobs(params?: { skip?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.skip != null) qs.set("skip", String(params.skip));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return apiGet<CrawlJobListResponse>(`/api/crawl/jobs${query ? `?${query}` : ""}`);
  },

  getJob(id: number) {
    return apiGet<CrawlJobResponse>(`/api/crawl/jobs/${id}`);
  },

  latestStatus() {
    return apiGet<Record<string, unknown>>("/api/crawl/jobs/latest_status");
  },

  runOnce(id: number) {
    return apiPost<Record<string, unknown>>(`/api/crawl/jobs/${id}/run_once`);
  },

  pause(id: number) {
    return apiPost<Record<string, unknown>>(`/api/crawl/jobs/${id}/pause`);
  },

  resume(id: number) {
    return apiPost<Record<string, unknown>>(`/api/crawl/jobs/${id}/resume`);
  },

  retry(id: number) {
    return apiPost<Record<string, unknown>>(`/api/crawl/jobs/${id}/retry`);
  },
};
