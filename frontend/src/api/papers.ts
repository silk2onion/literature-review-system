import { apiGet, apiPost, apiUpload, apiDownloadBlob } from "./http";
import type {
  SearchLocalRequest,
  SearchLocalResponse,
  JournalInfoLookup,
} from "../types/paper";

export const papersApi = {
  searchLocal(params: SearchLocalRequest, signal?: AbortSignal) {
    return apiPost<SearchLocalResponse>("/api/papers/search-local", params, signal);
  },

  batchDelete(ids: number[]) {
    return apiPost<{ deleted_count: number }>("/api/papers/batch-delete", {
      paper_ids: ids,
    });
  },

  batchArchive(ids: number[]) {
    return apiPost<{ count: number }>("/api/papers/archive", {
      paper_ids: ids,
    });
  },

  batchRestore(ids: number[]) {
    return apiPost<{ count: number }>("/api/papers/restore", {
      paper_ids: ids,
    });
  },

  uploadPdf(formData: FormData) {
    return apiUpload<{ doi?: string; title: string }>("/api/papers/upload", formData);
  },

  downloadPdf(paperId: number) {
    return apiDownloadBlob(`/api/papers/${paperId}/download-pdf`);
  },

  lookupJournal(name: string) {
    return apiGet<JournalInfoLookup>(
      `/api/journal-info/lookup?name=${encodeURIComponent(name)}`,
    );
  },

  enrichJournal(paperId: number) {
    return apiPost<{ message?: string; updated?: boolean }>(
      `/api/journal-info/enrich-paper/${paperId}`,
    );
  },
};
