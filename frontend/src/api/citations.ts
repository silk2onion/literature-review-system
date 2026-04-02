import { apiGet, apiPost } from "./http";

export interface CitationGraphNode {
  id: number;
  label: string;
  type: "central" | "cited" | "citing";
  year?: number | null;
  source?: string | null;
  extra?: Record<string, unknown> | null;
}

export interface CitationGraphEdge {
  from: number;
  to: number;
  source?: string | null;
  confidence: number;
  created_at?: string | null;
}

export interface CitationGraphStats {
  total_nodes: number;
  total_edges: number;
  by_source: Record<string, number>;
  in_degree: number;
  out_degree: number;
}

export interface CitationGraphResponse {
  center_paper_id: number;
  nodes: CitationGraphNode[];
  edges: CitationGraphEdge[];
  stats: CitationGraphStats;
}

export const citationsApi = {
  egoGraph(paperId: number, params?: { depth?: number }) {
    const qs = params?.depth ? `?depth=${params.depth}` : "";
    return apiGet<CitationGraphResponse>(
      `/api/citations/ego-graph/${paperId}${qs}`,
    );
  },

  syncForPaper(paperId: number) {
    return apiPost<Record<string, unknown>>(
      `/api/citations/sync-for-paper/${paperId}`,
    );
  },

  syncBatch(ids: number[]) {
    return apiPost<{
      processed_count: number;
      matched_references: number;
      created_edges: number;
    }>("/api/citations/sync-batch", { paper_ids: ids });
  },

  analyze() {
    return apiPost<{
      generation_tags: number;
      impact_tags: number;
      cluster_tags: number;
    }>("/api/citations/analysis/analyze");
  },
};
