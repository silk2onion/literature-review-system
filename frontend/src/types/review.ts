export interface ReferenceItem {
  paper_id?: number;
  order_index: number;
  citation_key: string;
  formatted: string;
  raw?: {
    title?: string;
    authors?: string[];
    year?: number;
    journal?: string;
    doi?: string;
  };
}

export interface ReferencesJson {
  style?: string;
  items: ReferenceItem[];
}

export interface Review {
  id: number;
  title: string;
  status: string;
  paper_count: number;
  created_at: string;
  abstract?: string;
  conclusion?: string;
  references_json?: ReferencesJson;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis_json?: any;
  content?: string;
  framework?: string;
}

export type EditingSection = "abstract" | "conclusion" | null;

export interface ValidationIssue {
  type: string;
  severity: "error" | "warning" | "info";
  message: string;
  paper_id?: number;
  location?: string;
  ref_key?: string;
}

export interface ValidationResult {
  review_id: number;
  valid: boolean;
  total_issues: number;
  errors: number;
  warnings: number;
  info: number;
  issues: ValidationIssue[];
  stats: {
    inline_citations_found: number;
    linked_papers: number;
    unresolved_refs: number;
  };
}

export interface ClaimEvidenceItem {
  section_title?: string;
  evidence_count?: number;
  supporting_paper_ids?: Array<number | string | null | undefined>;
}

export interface ClaimsEvidenceResponse {
  total_claims?: number;
  claims_evidence?: Record<string, ClaimEvidenceItem>;
}
