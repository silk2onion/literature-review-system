export interface Paper {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  source?: string;
  year?: number;
}

/** 后端 ChunkSnippet */
export interface ChunkSnippet {
  chunk_id?: number;
  paper_id?: number;
  content?: string;
  page_number?: number;
  score?: number;
  ref_marker?: string;
}

/** 后端 ClaimEvidence — Step 1 返回、Step 2/3 传递的核心数据结构 */
export interface ClaimEvidence {
  claim_id: number;
  text: string;
  rag_query: string;
  support_papers: number[];
  support_snippets: string[];
  chunk_snippets: ChunkSnippet[];
  section_id?: string;
  section_title?: string;
}

/** 后端 SectionClaimTable — Step 2/3 的请求体核心 */
export interface SectionClaimTable {
  section_id: string;
  section_title: string;
  claims: ClaimEvidence[];
}

/** 简化的 Claim 展示用（从 ClaimEvidence 映射） */
export interface Claim {
  id: number;
  text: string;
  topic: string;
  sub_topic: string;
}

/** 带证据的 Claim 展示用 */
export interface ClaimWithEvidence extends Claim {
  evidence: Paper[];
  support_snippets: string[];
}

export interface FrameworkSection {
  id: string;
  title: string;
  description: string;
  search_keywords?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Framework {
  title?: string;
  abstract_description?: string;
  sections?: FrameworkSection[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface AutoSearchResult {
  section_id: string;
  section_title: string;
  new_papers: number;
  fetched?: number;
  error?: string;
}

export interface AssembleStats {
  cited: number;
  sections: number;
}

/** 渲染后的章节 */
export interface RenderedSection {
  text: string;
  citation_map: Record<string, unknown>;
}
