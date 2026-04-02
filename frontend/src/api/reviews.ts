import { apiGet, apiPost, apiDelete, apiPatch, apiDownloadBlob } from "./http";
import type { Review, ValidationResult, ClaimsEvidenceResponse } from "../types/review";

export const reviewsApi = {
  list() {
    return apiGet<Review[]>("/api/reviews/");
  },

  get(id: number) {
    return apiGet<Review>(`/api/reviews/${id}`);
  },

  delete(id: number) {
    return apiDelete<boolean>(`/api/reviews/${id}`);
  },

  updateSections(id: number, body: Record<string, string>) {
    return apiPatch<Review>(`/api/reviews/${id}/sections`, body);
  },

  validate(id: number) {
    return apiPost<ValidationResult>(`/api/reviews/${id}/validate-citations`);
  },

  claimsEvidence(id: number) {
    return apiGet<ClaimsEvidenceResponse>(`/api/reviews/${id}/claims-evidence`);
  },

  exportMarkdown(id: number) {
    return apiPost<{ markdown: string }>(`/api/reviews/${id}/export`, {
      format: "markdown",
      include_references: true,
    });
  },

  exportDocx(id: number) {
    return apiDownloadBlob(`/api/reviews/${id}/export/docx`);
  },

  exportPdf(id: number) {
    return apiDownloadBlob(`/api/reviews/${id}/export/pdf`);
  },

  orchestrate(params: Record<string, unknown>) {
    return apiPost<Record<string, unknown>>("/api/reviews/orchestrate", params);
  },

  generateAbstract(id: number) {
    return apiPost<{ abstract?: string }>(`/api/reviews/${id}/generate-abstract`);
  },

  generateConclusion(id: number) {
    return apiPost<{ conclusion?: string }>(`/api/reviews/${id}/generate-conclusion`);
  },
};
