import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { useLocale } from "../hooks/useLocale";

interface Paper {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  year?: number;
  journal?: string;
  venue?: string;
  source?: string;
  doi?: string;
}

interface ActivatedGroup {
  name?: string;
  matched_words?: string[];
  all_words?: string[];
  strength?: number;
  weight?: number;
  [key: string]: unknown;
}

interface SemanticSearchItem {
  paper: Paper;
  score: number;
}

interface SemanticSearchDebug {
  expanded_keywords: string[];
  activated_groups: Record<string, ActivatedGroup>;
  total_candidates: number;
}

interface ChunkSearchResult {
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

interface SemanticSearchRequestPayload {
  keywords: string[];
  year_from?: number;
  year_to?: number;
  limit?: number;
}

type SearchMode = "paper" | "chunk";

function scoreColor(score: number) {
  if (score >= 0.8) return "#16a34a";
  if (score >= 0.6) return "#ca8a04";
  if (score >= 0.4) return "#ea580c";
  return "#dc2626";
}

function scoreBg(score: number) {
  if (score >= 0.8) return "#dcfce7";
  if (score >= 0.6) return "#fef9c3";
  if (score >= 0.4) return "#fff7ed";
  return "#fee2e2";
}

function SemanticSearchDebugPanel() {
  const { t } = useLocale();
  const [searchMode, setSearchMode] = useState<SearchMode>("paper");
  const [keywordInput, setKeywordInput] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [limit, setLimit] = useState("20");

  const [items, setItems] = useState<SemanticSearchItem[]>([]);
  const [debugInfo, setDebugInfo] = useState<SemanticSearchDebug | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [expandedPaper, setExpandedPaper] = useState<number | null>(null);

  const [chunkResults, setChunkResults] = useState<ChunkSearchResult[]>([]);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, []);

  async function handleSearch() {
    if (searchMode === "paper") await handlePaperSearch();
    else await handleChunkSearch();
  }

  async function handlePaperSearch() {
    setError(null); setMessage(null); setLoading(true);
    setItems([]); setDebugInfo(null); setProgress(null); setExpandedPaper(null);

    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    try {
      const keywords = keywordInput.split(",").map((k) => k.trim()).filter(Boolean);
      if (keywords.length === 0) throw new Error(t("rag.errorNoKeywords"));

      const body: SemanticSearchRequestPayload = { keywords };
      if (yearFrom) body.year_from = Number(yearFrom);
      if (yearTo) body.year_to = Number(yearTo);
      if (limit) body.limit = Number(limit);

      const wsUrl = `${API_BASE_URL.replace(/^http/, "ws")}/api/semantic-search/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => { ws.send(JSON.stringify({ type: "search", payload: body })); };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "debug" && data.debug) {
            setDebugInfo(data.debug);
            if (data.message) setMessage(data.message);
          } else if (data.type === "partial_result" && data.items) {
            setItems((prev) => [...prev, ...(data.items ?? [])]);
            if (data.progress) setProgress(data.progress);
          } else if (data.type === "done") {
            setLoading(false);
          } else if (data.type === "error") {
            setError(data.message || t("rag.errorSearch")); setLoading(false);
          }
        } catch { setError(t("rag.errorParseWs")); setLoading(false); }
      };
      ws.onerror = () => { setError(t("rag.errorWsConnection")); setLoading(false); };
      ws.onclose = () => { wsRef.current = null; };
    } catch (e) {
      setError((e as Error).message || t("rag.errorSearch"));
      setItems([]); setDebugInfo(null); setLoading(false);
    }
  }

  async function handleChunkSearch() {
    setChunkError(null); setChunkLoading(true); setChunkResults([]); setExpandedChunks(new Set());
    try {
      const keywords = keywordInput.split(",").map((k) => k.trim()).filter(Boolean);
      if (keywords.length === 0) throw new Error(t("rag.errorNoKeywords"));
      const resp = await fetch(`${API_BASE_URL}/api/semantic-search/chunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, limit: Number(limit) || 20, score_threshold: 0.25 }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${resp.status}`); }
      const data = await resp.json();
      setChunkResults(data.items || []);
    } catch (e) { setChunkError((e as Error).message || t("rag.errorChunkSearch")); }
    finally { setChunkLoading(false); }
  }

  const isLoading = searchMode === "paper" ? loading : chunkLoading;
  const currentError = searchMode === "paper" ? error : chunkError;

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>
          {t("rag.title")}
        </h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          {t("rag.description")}
        </p>
      </div>

      {/* Mode Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20 }}>
        {(["paper", "chunk"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSearchMode(mode)}
            style={{
              padding: "8px 20px",
              border: "1px solid #cbd5e1",
              borderRadius: mode === "paper" ? "8px 0 0 8px" : "0 8px 8px 0",
              borderLeft: mode === "chunk" ? "none" : undefined,
              background: searchMode === mode
                ? "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)"
                : "#ffffff",
              color: searchMode === mode ? "#fff" : "#64748b",
              cursor: "pointer",
              fontWeight: searchMode === mode ? 600 : 400,
              fontSize: 13,
            }}
          >
            {mode === "paper" ? t("rag.paperSearch") : t("rag.chunkSearch")}
          </button>
        ))}
      </div>

      {/* Search Form */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "16px 20px", borderRadius: 10,
          backgroundColor: "#f8fafc", border: "1px solid #e2e8f0",
          marginBottom: 20, flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{t("rag.keywordsLabel")}</label>
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder={t("rag.keywordsPlaceholder")}
            style={{
              width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 6,
              border: "1px solid #cbd5e1", fontSize: 13, backgroundColor: "#fff",
            }}
          />
        </div>
        {searchMode === "paper" && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{t("rag.yearLabel")}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <input value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2015"
                  style={{ width: 60, padding: "8px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }} />
                <span style={{ color: "#94a3b8" }}>-</span>
                <input value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2025"
                  style={{ width: 60, padding: "8px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }} />
              </div>
            </div>
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Top K</label>
          <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="20"
            style={{ display: "block", width: 50, marginTop: 4, padding: "8px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }} />
        </div>
        <button
          onClick={handleSearch}
          disabled={isLoading}
          style={{
            alignSelf: "flex-end", padding: "8px 24px", borderRadius: 8, border: "none",
            background: isLoading ? "#94a3b8" : "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
            color: "#fff", fontSize: 13, fontWeight: 600, cursor: isLoading ? "default" : "pointer",
          }}
        >
          {isLoading ? t("rag.searching") : t("rag.search")}
        </button>
      </div>

      {/* Status */}
      {currentError && (
        <div style={{ padding: "10px 14px", borderRadius: 8, backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>
          {currentError}
        </div>
      )}
      {searchMode === "paper" && message && !error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", fontSize: 13, marginBottom: 16 }}>
          {message}
          {progress && ` (${progress.current}/${progress.total})`}
        </div>
      )}

      {/* Debug Info */}
      {searchMode === "paper" && debugInfo && (
        <div style={{ padding: "16px 20px", borderRadius: 10, backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: "0 0 12px" }}>{t("rag.debugInfo")}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, fontSize: 13 }}>
            <div>
              <span style={{ color: "#64748b", fontWeight: 500 }}>{t("rag.expandedKeywords")}: </span>
              {debugInfo.expanded_keywords.length > 0 ? (
                <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                  {debugInfo.expanded_keywords.map((k, i) => (
                    <span key={i} style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                      backgroundColor: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe",
                    }}>{k}</span>
                  ))}
                </span>
              ) : <span style={{ color: "#94a3b8" }}>{t("rag.noExpansion")}</span>}
            </div>
            <div>
              <span style={{ color: "#64748b", fontWeight: 500 }}>{t("rag.candidates")}: </span>
              <strong style={{ color: "#0f172a" }}>{debugInfo.total_candidates}</strong> {t("rag.papers")}
            </div>
            {Object.keys(debugInfo.activated_groups).length > 0 && (
              <div>
                <span style={{ color: "#64748b", fontWeight: 500 }}>{t("rag.activatedGroups")}: </span>
                <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                  {Object.entries(debugInfo.activated_groups).map(([key, g]) => (
                    <span key={key} style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                      backgroundColor: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe",
                    }} title={`${t("rag.matchedWords")}: ${(g.matched_words || []).join(", ")}`}>
                      {g.name || key} ({((g.strength ?? 0) * 100).toFixed(0)}%)
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paper Results */}
      {searchMode === "paper" && items.length > 0 && (
        <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", backgroundColor: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 1 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>
              {t("rag.searchResults")}
            </h3>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {t("rag.totalPapersSorted", { count: items.length })}
            </span>
          </div>
          <div style={{ maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
            {items.map((item, idx) => {
              const isExpanded = expandedPaper === item.paper.id;
              return (
                <div
                  key={item.paper.id}
                  onClick={() => setExpandedPaper(isExpanded ? null : item.paper.id)}
                  style={{
                    padding: "14px 20px",
                    borderBottom: idx < items.length - 1 ? "1px solid #f1f5f9" : "none",
                    cursor: "pointer",
                    backgroundColor: isExpanded ? "#f8fafc" : "transparent",
                    transition: "background-color 0.15s",
                  }}
                >
                  {/* Main row */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Rank */}
                    <span style={{
                      width: 28, height: 28, borderRadius: "50%", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0,
                      fontSize: 12, fontWeight: 700,
                      backgroundColor: idx < 3 ? "#eff6ff" : "#f8fafc",
                      color: idx < 3 ? "#2563eb" : "#94a3b8",
                      border: `1px solid ${idx < 3 ? "#bfdbfe" : "#e2e8f0"}`,
                    }}>
                      {idx + 1}
                    </span>

                    {/* Score */}
                    <span style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                      fontFamily: "monospace", flexShrink: 0,
                      backgroundColor: scoreBg(item.score), color: scoreColor(item.score),
                    }}>
                      {item.score.toFixed(3)}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>
                        {item.paper.title}
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap", fontSize: 12, color: "#64748b" }}>
                        {item.paper.authors && item.paper.authors.length > 0 && (
                          <span>{item.paper.authors.slice(0, 3).join(", ")}{item.paper.authors.length > 3 ? " et al." : ""}</span>
                        )}
                        {item.paper.year && <span style={{ fontWeight: 600 }}>{item.paper.year}</span>}
                        {(item.paper.journal || item.paper.venue) && (
                          <span style={{ fontStyle: "italic" }}>{item.paper.journal || item.paper.venue}</span>
                        )}
                        {item.paper.doi && (
                          <a
                            href={`https://doi.org/${item.paper.doi}`}
                            target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            DOI
                          </a>
                        )}
                      </div>

                      {/* Expanded: abstract */}
                      {isExpanded && item.paper.abstract && (
                        <div style={{
                          marginTop: 10, padding: "10px 14px", borderRadius: 8,
                          backgroundColor: "#f1f5f9", fontSize: 12, color: "#475569",
                          lineHeight: 1.6, maxHeight: 200, overflowY: "auto",
                        }}>
                          {item.paper.abstract}
                        </div>
                      )}
                      {isExpanded && !item.paper.abstract && (
                        <div style={{ marginTop: 10, fontSize: 12, color: "#cbd5e1", fontStyle: "italic" }}>
                          {t("rag.noAbstract")}
                        </div>
                      )}
                    </div>

                    {/* Expand icon */}
                    <span style={{ color: "#94a3b8", fontSize: 14, flexShrink: 0 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chunk Results */}
      {searchMode === "chunk" && chunkResults.length > 0 && (
        <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", backgroundColor: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 1 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>
              {t("rag.chunkResults")}
            </h3>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {t("rag.totalChunksSorted", { count: chunkResults.length, papers: new Set(chunkResults.map((c) => c.paper_id)).size })}
            </span>
          </div>
          <div style={{ maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
            {chunkResults.map((chunk, idx) => {
              const isExp = expandedChunks.has(idx);
              return (
                <div
                  key={idx}
                  onClick={() => {
                    setExpandedChunks((prev) => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx); else next.add(idx);
                      return next;
                    });
                  }}
                  style={{
                    padding: "12px 20px",
                    borderBottom: idx < chunkResults.length - 1 ? "1px solid #f1f5f9" : "none",
                    cursor: "pointer",
                    backgroundColor: isExp ? "#f8fafc" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{
                      padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                      fontFamily: "monospace",
                      backgroundColor: scoreBg(chunk.score), color: scoreColor(chunk.score),
                    }}>
                      {chunk.score.toFixed(3)}
                    </span>
                    {chunk.page_number != null && (
                      <span style={{
                        padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        backgroundColor: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe",
                      }}>
                        p.{chunk.page_number}
                      </span>
                    )}
                    {chunk.ref_marker && (
                      <span style={{
                        padding: "2px 8px", borderRadius: 6, fontSize: 10, fontFamily: "monospace",
                        backgroundColor: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe",
                      }}>
                        {chunk.ref_marker}
                      </span>
                    )}
                    <span style={{ flex: 1, fontSize: 13, color: "#0f172a", fontWeight: 600 }}>
                      {chunk.paper_title}
                      {chunk.paper_year && <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 6 }}>({chunk.paper_year})</span>}
                    </span>
                    <span style={{ color: "#cbd5e1", fontSize: 11 }}>chunk #{chunk.chunk_index}</span>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {!isExp && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {chunk.chunk_content.slice(0, 150)}...
                    </div>
                  )}

                  {isExp && (
                    <div style={{
                      marginTop: 10, padding: "12px 14px", borderRadius: 8,
                      backgroundColor: "#f1f5f9", border: "1px solid #e2e8f0",
                      fontSize: 12, color: "#475569", lineHeight: 1.7,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {chunk.chunk_content}
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0", display: "flex", gap: 16, fontSize: 11, color: "#94a3b8" }}>
                        <span>Paper ID: {chunk.paper_id}</span>
                        <span>Score: {chunk.score.toFixed(6)}</span>
                        {chunk.paper_authors && <span>Authors: {chunk.paper_authors}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty states */}
      {searchMode === "paper" && !loading && items.length === 0 && !error && !debugInfo && (
        <div style={{ textAlign: "center", color: "#94a3b8", marginTop: 48, fontSize: 14 }}>
          {t("rag.emptyPaperHint")}
        </div>
      )}
      {searchMode === "chunk" && !chunkLoading && chunkResults.length === 0 && !chunkError && (
        <div style={{ textAlign: "center", color: "#94a3b8", marginTop: 48, fontSize: 14 }}>
          {t("rag.emptyChunkHint")}
          <br />
          <span style={{ fontSize: 12 }}>{t("rag.emptyChunkNote")}</span>
        </div>
      )}
    </div>
  );
}

export default SemanticSearchDebugPanel;
