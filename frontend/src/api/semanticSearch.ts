import { apiPost } from "./http";
import { API_BASE_URL } from "./config";

export interface ChunkSearchResult {
  paper_id: number;
  paper_title: string;
  paper_authors?: string;
  paper_year?: number;
  chunk_index: number;
  chunk_content: string;
  page_number?: number;
  score: number;
  ref_index?: number;
  ref_marker?: string;
}

export const semanticSearchApi = {
  searchChunks(params: {
    keywords: string[];
    year_from?: number;
    year_to?: number;
    limit?: number;
  }) {
    return apiPost<ChunkSearchResult[]>("/api/semantic-search/chunks", params);
  },

  getWsUrl(): string {
    return `${API_BASE_URL.replace(/^http/, "ws")}/api/semantic-search/ws`;
  },
};
