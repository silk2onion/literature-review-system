import { apiGet, apiDelete } from "./http";

export interface UsageLog {
  id: number;
  call_type: string;
  source: string;
  model: string | null;
  endpoint: string | null;
  method: string | null;
  status_code: number | null;
  success: boolean;
  duration_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  result_count: number | null;
  error: string | null;
  metadata_json: Record<string, unknown> | null;
  caller: string | null;
  created_at: string | null;
}

export interface PageResponse {
  items: UsageLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UsageStats {
  total_calls: number;
  total_errors: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_duration_ms: number;
  by_type: Record<string, number>;
  by_source: Record<string, number>;
  by_model: Record<string, number>;
  error_rate: number;
  avg_duration_ms: number;
}

export const usageApi = {
  getLogs(params: {
    call_type?: string;
    source?: string;
    success?: string;
    page: number;
    page_size: number;
  }) {
    const qs = new URLSearchParams();
    if (params.call_type) qs.set("call_type", params.call_type);
    if (params.source) qs.set("source", params.source);
    if (params.success) qs.set("success", params.success);
    qs.set("page", String(params.page));
    qs.set("page_size", String(params.page_size));
    return apiGet<PageResponse>(`/api/usage/logs?${qs}`);
  },

  getStats(params?: Record<string, string>) {
    const qs = params ? new URLSearchParams(params).toString() : "";
    return apiGet<UsageStats>(`/api/usage/stats${qs ? `?${qs}` : ""}`);
  },

  cleanup(days: number) {
    return apiDelete<{ deleted: number }>(`/api/usage/logs/cleanup?days=${days}`);
  },
};
