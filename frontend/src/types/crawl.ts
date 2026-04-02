export type JobStatusCode =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "paused";

export interface CrawlJobPayload {
  keywords: string[];
  sources: string[];
  year_from: number | null;
  year_to: number | null;
  max_results: number;
  page_size: number;
  exhaustive?: boolean;
}

export interface CrawlJob {
  id: number;
  keywords: string[];
  sources: string[];
  year_from?: number | null;
  year_to?: number | null;
  max_results: number;
  page_size: number;
  exhaustive?: boolean;
  current_page: number;
  fetched_count: number;
  failed_count: number;
  status: JobStatusCode;
  search_strategy?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlJobResponse extends CrawlJob {}

export interface CrawlJobListResponse {
  total: number;
  items: CrawlJob[];
}
