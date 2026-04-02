export interface Paper {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  source?: string;
  year?: number;
}

export interface Claim {
  id: number;
  text: string;
  topic: string;
  sub_topic: string;
}

export interface ClaimWithEvidence extends Claim {
  evidence: Paper[];
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
