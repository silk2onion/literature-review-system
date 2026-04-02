// Re-export legacy types
export type { Paper, LiteratureGroup, GroupPaper } from "../types";

export type PaperResponse = {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  publication_date?: string;
  year?: number;
  journal?: string | null;
  journal_issn?: string | null;
  venue?: string | null;
  journal_impact_factor?: number | null;
  journal_quartile?: string | null;
  indexing?: string[] | null;
  doi?: string | null;
  arxiv_id?: string | null;
  pmid?: string | null;
  url?: string | null;
  pdf_url?: string | null;
  source?: string | null;
  categories?: string[] | null;
  keywords?: string[] | null;
  citations_count?: number | null;
  pdf_path?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaperInfo = {
  id: number;
  title: string;
  authors?: string;
  year?: number;
  journal?: string;
  doi?: string;
};

export type SearchLocalRequest = {
  q?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  page: number;
  page_size: number;
  group_id?: number;
  include_archived?: boolean;
};

export type SearchLocalResponse = {
  success: boolean;
  total: number;
  items: PaperResponse[];
  message?: string | null;
  search_context?: {
    query_keywords: string[];
    expanded_keywords: string[];
    group_keys: string[];
  };
};

export type JournalInfoLookup = {
  name: string | null;
  issn: string | null;
  impact_factor: number | null;
  quartile: string | null;
  indexing: string[] | null;
  source: "local_library" | "not_found";
};
