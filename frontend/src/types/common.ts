export type TaskStatus = "idle" | "running" | "done" | "error";

export type SortField = "year" | "title" | "firstAuthor" | "source" | "createdAt";
export type SortOrder = "asc" | "desc";
export type SourceFilter = "all" | "arxiv" | "crossref" | "semantic_scholar";
