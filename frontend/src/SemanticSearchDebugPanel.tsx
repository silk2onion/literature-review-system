import { useEffect, useRef, useState } from "react";

const API_BASE_URL = "http://localhost:5444";

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
  keywords?: string[];
  score?: number;
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

function SemanticSearchDebugPanel() {
  const [searchMode, setSearchMode] = useState<SearchMode>("paper");
  const [keywordInput, setKeywordInput] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [limit, setLimit] = useState("20");

  // Paper-level state
  const [items, setItems] = useState<SemanticSearchItem[]>([]);
  const [debugInfo, setDebugInfo] = useState<SemanticSearchDebug | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Chunk-level state
  const [chunkResults, setChunkResults] = useState<ChunkSearchResult[]>([]);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  async function handleSearch() {
    if (searchMode === "paper") {
      await handlePaperSearch();
    } else {
      await handleChunkSearch();
    }
  }

  async function handlePaperSearch() {
    setError(null);
    setMessage(null);
    setLoading(true);
    setItems([]);
    setDebugInfo(null);
    setProgress(null);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const keywords = keywordInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      if (keywords.length === 0) {
        throw new Error("请先输入至少一个关键词");
      }

      const body: SemanticSearchRequestPayload = { keywords };

      if (yearFrom) body.year_from = Number(yearFrom);
      if (yearTo) body.year_to = Number(yearTo);
      if (limit) body.limit = Number(limit);

      const wsUrl = `${API_BASE_URL.replace(/^http/, "ws")}/api/semantic-search/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "search", payload: body }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            message?: string;
            debug?: SemanticSearchDebug;
            items?: SemanticSearchItem[];
            progress?: { current: number; total: number };
          };

          if (data.type === "debug" && data.debug) {
            setDebugInfo(data.debug);
            if (data.message) setMessage(data.message);
          } else if (data.type === "partial_result" && data.items) {
            setItems((prev) => [...prev, ...(data.items ?? [])]);
            if (data.progress) {
              setProgress({
                current: data.progress.current,
                total: data.progress.total,
              });
            }
          } else if (data.type === "done") {
            setLoading(false);
          } else if (data.type === "error") {
            setError(data.message || "语义检索时出现错误");
            setLoading(false);
          }
        } catch (err) {
          console.error("解析 WebSocket 消息时出现错误", err);
          setError("解析 WebSocket 消息时出现错误");
          setLoading(false);
        }
      };

      ws.onerror = () => {
        setError("WebSocket 连接出现错误");
        setLoading(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch (e) {
      const err = e as Error;
      setError(err.message || "语义检索时出现错误");
      setItems([]);
      setDebugInfo(null);
      setLoading(false);
    }
  }

  async function handleChunkSearch() {
    setChunkError(null);
    setChunkLoading(true);
    setChunkResults([]);
    setExpandedChunks(new Set());

    try {
      const keywords = keywordInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      if (keywords.length === 0) {
        throw new Error("请先输入至少一个关键词");
      }

      const body: Record<string, unknown> = {
        keywords,
        limit: Number(limit) || 20,
        score_threshold: 0.25,
      };

      const resp = await fetch(`${API_BASE_URL}/api/semantic-search/chunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setChunkResults(data.items || []);
    } catch (e) {
      const err = e as Error;
      setChunkError(err.message || "Chunk 检索失败");
    } finally {
      setChunkLoading(false);
    }
  }

  function toggleChunkExpand(idx: number) {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const isLoading = searchMode === "paper" ? loading : chunkLoading;
  const currentError = searchMode === "paper" ? error : chunkError;

  return (
    <div className="semantic-search-debug-root">
      <div className="semantic-search-debug-header">
        <h2>RAG 语义检索可视化调试</h2>
        <p className="subtitle">
          输入关键词，查看语义组扩展、相似度排序结果。支持 Paper 级和 Chunk
          级两种检索模式。
        </p>
      </div>

      {/* ── Mode Tabs ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setSearchMode("paper")}
          style={{
            padding: "8px 20px",
            border: "1px solid #555",
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
            background: searchMode === "paper" ? "#4a9eff" : "#2a2a2a",
            color: searchMode === "paper" ? "#fff" : "#aaa",
            cursor: "pointer",
            fontWeight: searchMode === "paper" ? 600 : 400,
            fontSize: "13px",
          }}
        >
          📄 Paper 级检索
        </button>
        <button
          type="button"
          onClick={() => setSearchMode("chunk")}
          style={{
            padding: "8px 20px",
            border: "1px solid #555",
            borderRadius: "0 6px 6px 0",
            background: searchMode === "chunk" ? "#4a9eff" : "#2a2a2a",
            color: searchMode === "chunk" ? "#fff" : "#aaa",
            cursor: "pointer",
            fontWeight: searchMode === "chunk" ? 600 : 400,
            fontSize: "13px",
          }}
        >
          🔍 Chunk 级检索 (含页码)
        </button>
      </div>

      {/* ── Search Form ── */}
      <div className="semantic-search-debug-form">
        <div className="form-row">
          <label className="form-label">关键词（逗号分隔）</label>
          <input
            className="hero-search-input"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="例如：urban design, public space, street life"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </div>
        <div className="form-row">
          {searchMode === "paper" && (
            <>
              <label className="form-label">年份范围</label>
              <input
                className="hero-mini-input"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="2015"
              />
              <span className="hero-sep">-</span>
              <input
                className="hero-mini-input"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="2025"
              />
            </>
          )}
          <label className="form-label">Top K</label>
          <input
            className="hero-mini-input"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="20"
          />
          <button
            type="button"
            className="primary-button hero-search-button"
            onClick={handleSearch}
            disabled={isLoading}
          >
            {isLoading
              ? "检索中…"
              : searchMode === "paper"
                ? "执行语义检索"
                : "执行 Chunk 检索"}
          </button>
        </div>
      </div>

      {/* ── Errors & Messages ── */}
      {currentError && (
        <div className="error-text" style={{ marginTop: 12 }}>
          {currentError}
        </div>
      )}
      {searchMode === "paper" && message && !error && (
        <div className="info-text" style={{ marginTop: 12 }}>
          {message}
        </div>
      )}
      {searchMode === "paper" && progress && !error && (
        <div className="info-text" style={{ marginTop: 8 }}>
          进度：{progress.current} / {progress.total}
        </div>
      )}

      {/* ── Paper-level Debug Info ── */}
      {searchMode === "paper" && debugInfo && (
        <div className="semantic-search-debug-section">
          <h3>调试信息</h3>
          <div className="debug-block">
            <div className="debug-row">
              <strong>扩展关键词：</strong>
              {debugInfo.expanded_keywords.length > 0 ? (
                <div className="keyword-chips">
                  {debugInfo.expanded_keywords.map((k, idx) => (
                    <span key={idx} className="chip">
                      {k}
                    </span>
                  ))}
                </div>
              ) : (
                <span>无</span>
              )}
            </div>
            <div className="debug-row">
              <strong>候选文献总数：</strong>
              <span>{debugInfo.total_candidates}</span>
            </div>
            <div className="debug-row">
              <strong>激活语义组：</strong>
              {Object.keys(debugInfo.activated_groups).length > 0 ? (
                <ul className="group-list">
                  {Object.entries(debugInfo.activated_groups).map(
                    ([key, group]) => (
                      <li key={key} className="group-item">
                        <div className="group-title">
                          <span className="chip">{key}</span>
                        </div>
                        <pre
                          className="code-block"
                          style={{ whiteSpace: "pre-wrap" }}
                        >
                          {JSON.stringify(group, null, 2)}
                        </pre>
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <span>无激活语义组</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Paper-level Results ── */}
      {searchMode === "paper" && items.length > 0 && (
        <div className="semantic-search-debug-section">
          <h3>检索结果（按相似度排序）</h3>
          <table className="result-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Score</th>
                <th style={{ width: 80 }}>Year</th>
                <th>Title</th>
                <th style={{ width: 220 }}>Authors</th>
                <th style={{ width: 120 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.paper.id}>
                  <td>{item.score.toFixed(4)}</td>
                  <td>{item.paper.year ?? "-"}</td>
                  <td>{item.paper.title}</td>
                  <td>
                    {item.paper.authors && item.paper.authors.length > 0
                      ? item.paper.authors.join(", ")
                      : "-"}
                  </td>
                  <td>
                    {item.paper.journal ||
                      item.paper.venue ||
                      item.paper.source ||
                      "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Chunk-level Results ── */}
      {searchMode === "chunk" && chunkResults.length > 0 && (
        <div className="semantic-search-debug-section">
          <h3>
            Chunk 检索结果
            <span
              style={{
                fontSize: "13px",
                fontWeight: 400,
                color: "#888",
                marginLeft: 8,
              }}
            >
              共 {chunkResults.length} 条 · 来自{" "}
              {new Set(chunkResults.map((c) => c.paper_id)).size} 篇论文
            </span>
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {chunkResults.map((chunk, idx) => {
              const isExpanded = expandedChunks.has(idx);
              const scoreColor =
                chunk.score >= 0.7
                  ? "#4caf50"
                  : chunk.score >= 0.5
                    ? "#ff9800"
                    : chunk.score >= 0.3
                      ? "#ff5722"
                      : "#999";

              return (
                <div
                  key={idx}
                  style={{
                    background: "#1e1e1e",
                    border: "1px solid #333",
                    borderRadius: 8,
                    padding: "12px 16px",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                  onClick={() => toggleChunkExpand(idx)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "#4a9eff")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "#333")
                  }
                >
                  {/* Header row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Score badge */}
                    <span
                      style={{
                        background: scoreColor + "22",
                        color: scoreColor,
                        border: `1px solid ${scoreColor}44`,
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        fontFamily: "monospace",
                        minWidth: 60,
                        textAlign: "center",
                      }}
                    >
                      {chunk.score.toFixed(4)}
                    </span>

                    {/* Page badge */}
                    {chunk.page_number != null && (
                      <span
                        style={{
                          background: "#4a9eff22",
                          color: "#4a9eff",
                          border: "1px solid #4a9eff44",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        📄 p.{chunk.page_number}
                      </span>
                    )}

                    {/* REF marker */}
                    {chunk.ref_marker && (
                      <span
                        style={{
                          background: "#9c27b022",
                          color: "#ce93d8",
                          border: "1px solid #9c27b044",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: "11px",
                          fontFamily: "monospace",
                        }}
                      >
                        {chunk.ref_marker}
                      </span>
                    )}

                    {/* Paper info */}
                    <span style={{ fontSize: "13px", color: "#ccc", flex: 1 }}>
                      <strong style={{ color: "#e0e0e0" }}>
                        {chunk.paper_title}
                      </strong>
                      {chunk.paper_year && (
                        <span style={{ color: "#888", marginLeft: 6 }}>
                          ({chunk.paper_year})
                        </span>
                      )}
                      {chunk.paper_authors && (
                        <span
                          style={{
                            color: "#666",
                            marginLeft: 8,
                            fontSize: "12px",
                          }}
                        >
                          — {chunk.paper_authors}
                        </span>
                      )}
                    </span>

                    {/* Chunk index */}
                    <span style={{ color: "#666", fontSize: "11px" }}>
                      chunk #{chunk.chunk_index}
                    </span>

                    {/* Expand indicator */}
                    <span style={{ color: "#666", fontSize: "12px" }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Preview (always shown) */}
                  {!isExpanded && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: "12px",
                        color: "#999",
                        lineHeight: 1.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {chunk.chunk_content.slice(0, 150)}...
                    </div>
                  )}

                  {/* Full content (when expanded) */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "12px",
                        background: "#161616",
                        borderRadius: 6,
                        border: "1px solid #2a2a2a",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#bbb",
                          lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {chunk.chunk_content}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: "1px solid #333",
                          display: "flex",
                          gap: 16,
                          fontSize: "11px",
                          color: "#666",
                        }}
                      >
                        <span>Paper ID: {chunk.paper_id}</span>
                        <span>Chunk Index: {chunk.chunk_index}</span>
                        {chunk.page_number != null && (
                          <span>Page: {chunk.page_number}</span>
                        )}
                        <span>Score: {chunk.score.toFixed(6)}</span>
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
      {searchMode === "chunk" &&
        !chunkLoading &&
        chunkResults.length === 0 &&
        chunkError === null && (
          <div
            style={{
              textAlign: "center",
              color: "#666",
              marginTop: 40,
              fontSize: "14px",
            }}
          >
            输入关键词执行 Chunk 级检索，查看 PDF 文本片段及其页码。
            <br />
            <span style={{ fontSize: "12px", color: "#555" }}>
              提示：需要先在文献管理页面对论文执行 PDF 分段 (Chunking) 操作。
            </span>
          </div>
        )}
    </div>
  );
}

export default SemanticSearchDebugPanel;
