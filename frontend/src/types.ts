export interface Paper {
  id: number
  title: string
  authors?: string[]
  abstract?: string
  source?: string
  year?: number
  url?: string
  citation_count?: number
  is_open_access?: boolean
  // Journal info
  journal_name?: string
  journal_impact_factor?: number
  journal_quartile?: string
  journal_ccf_rank?: string
  journal_is_top?: boolean
  // Embedding
  embedding?: number[]
  // Timestamps
  created_at?: string
  updated_at?: string
}

export interface LiteratureGroup {
  id: number
  name: string
  description?: string
  created_at: string
  updated_at: string
  paper_count?: number
}

export interface GroupPaper {
  group_id: number
  paper_id: number
  added_at: string
}

export type JobStatusCode = 'pending' | 'running' | 'completed' | 'failed' | 'paused'

export interface CrawlJobPayload {
  keywords: string[];
  sources: string[];
  year_from: number | null;
  year_to: number | null;
  max_results: number;
  page_size: number;
}

export interface CrawlJob {
  id: number
  keywords: string[]
  sources: string[]
  year_from?: number | null
  year_to?: number | null
  max_results: number
  page_size: number
  current_page: number
  fetched_count: number
  failed_count: number
  status: JobStatusCode
  created_at: string
  updated_at: string
}

export interface CrawlJobResponse extends CrawlJob { }

export interface CrawlJobListResponse {
  total: number
  items: CrawlJob[]
}