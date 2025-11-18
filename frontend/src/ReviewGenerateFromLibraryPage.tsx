import { useEffect, useState } from "react";
import PhdPipelinePage from "./PhdPipelinePage";
import { groupsApi, type LiteratureGroup } from "./api/groups";

type PaperResponse = {
  id: number;
  title: string;
  authors?: string[];
  year?: number;
  source?: string | null;
  abstract?: string;
};

type SearchLocalResponse = {
  success: boolean;
  total: number;
  items: PaperResponse[];
};

type ReviewGenerateResponse = {
  success: boolean;
  review_id: number;
  status: string;
  message?: string;
  preview_markdown?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary_stats?: any;
};

const API_BASE_URL = "http://127.0.0.1:5444";

export default function ReviewGenerateFromLibraryPage() {
  const [mode, setMode] = useState<"standard" | "phd">("standard");

  // --- Paper Selection State ---
  const [sourceMode, setSourceMode] = useState<"manual" | "group">("manual");
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<PaperResponse[]>([]);
  // const [total, setTotal] = useState(0); // unused for now
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(new Set());

  // --- Group Selection State ---
  const [groups, setGroups] = useState<LiteratureGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  
  // --- Generation State ---
  const [keywords, setKeywords] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatedReview, setGeneratedReview] = useState<ReviewGenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch papers (simplified version of LibraryPage)
  const fetchPapers = async () => {
    try {
      setLoadingPapers(true);
      const resp = await fetch(`${API_BASE_URL}/api/papers/search-local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query.trim() || undefined,
          page: 1,
          page_size: 100, // Fetch more for selection
        }),
      });
      const data: SearchLocalResponse = await resp.json();
      setPapers(data.items || []);
      // setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch papers", err);
    } finally {
      setLoadingPapers(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, []); // Initial load

  const handleTogglePaper = (id: number) => {
    const newSet = new Set(selectedPaperIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPaperIds(newSet);
  };

  const handleGenerate = async () => {
    if (selectedPaperIds.size === 0) {
      setError("请至少选择一篇文献");
      return;
    }
    if (!keywords.trim()) {
      setError("请输入综述关键词");
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedReview(null);

    try {
      const payload = {
        keywords: keywords.split(/[,，]/).map(k => k.trim()).filter(k => k),
        paper_ids: Array.from(selectedPaperIds),
        paper_limit: selectedPaperIds.size, // Explicitly use all selected
        custom_prompt: customPrompt.trim() || undefined,
        phd_pipeline: false, // Default to standard review for now
      };

      const resp = await fetch(`${API_BASE_URL}/api/reviews/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: ReviewGenerateResponse = await resp.json();
      if (data.success) {
        setGeneratedReview(data);
      } else {
        setError(data.message || "生成失败");
      }
    } catch (err) {
      setError(`请求失败: ${err}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (format: 'markdown' | 'docx' | 'pdf') => {
    if (!generatedReview?.review_id) return;
    setExporting(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/reviews/${generatedReview.review_id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, include_references: true }),
      });
      if (!resp.ok) throw new Error('Export failed');
      
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-${generatedReview.review_id}.${format === 'markdown' ? 'md' : format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert('导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        height: "100%",
        boxSizing: "border-box",
        backgroundColor: "#020617",
        color: "#e5e7eb",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "8px" }}>
            综述生成工作台
          </h1>
          <p style={{ color: "#9ca3af", fontSize: "14px" }}>
            选择文献并生成综述，支持标准模式与 PhD 深度模式
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", backgroundColor: "#1e293b", padding: "4px", borderRadius: "8px" }}>
          <button
            onClick={() => setMode("standard")}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: mode === "standard" ? "#3b82f6" : "transparent",
              color: mode === "standard" ? "#fff" : "#9ca3af",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "13px",
            }}
          >
            标准综述
          </button>
          <button
            onClick={() => setMode("phd")}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: mode === "phd" ? "#8b5cf6" : "transparent",
              color: mode === "phd" ? "#fff" : "#9ca3af",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "13px",
            }}
          >
            PhD 深度管线
          </button>
        </div>
      </header>

      <div style={{ display: "flex", gap: "24px", flex: 1, minHeight: 0 }}>
        {/* Left Panel: Paper Selection */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            border: "1px solid #1f2937",
            borderRadius: "8px",
            padding: "16px",
            backgroundColor: "#0f172a",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
              选择文献 ({selectedPaperIds.size} 篇)
            </h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索文献..."
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  border: "1px solid #334155",
                  backgroundColor: "#1e293b",
                  color: "#fff",
                  fontSize: "13px",
                }}
                onKeyDown={(e) => e.key === "Enter" && fetchPapers()}
              />
              <button
                onClick={fetchPapers}
                style={{
                  padding: "4px 12px",
                  borderRadius: "4px",
                  border: "none",
                  backgroundColor: "#3b82f6",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                搜索
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", border: "1px solid #334155", borderRadius: "4px" }}>
            {loadingPapers ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#9ca3af" }}>加载中...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", backgroundColor: "#1e293b", textAlign: "left" }}>
                    <th style={{ padding: "8px", width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={papers.length > 0 && selectedPaperIds.size === papers.length}
                        onChange={() => {
                          if (selectedPaperIds.size === papers.length) {
                            setSelectedPaperIds(new Set());
                          } else {
                            setSelectedPaperIds(new Set(papers.map((p) => p.id)));
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ padding: "8px" }}>标题</th>
                    <th style={{ padding: "8px", width: "60px" }}>年份</th>
                    <th style={{ padding: "8px", width: "80px" }}>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #1f2937",
                        backgroundColor: selectedPaperIds.has(p.id) ? "rgba(59, 130, 246, 0.1)" : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => handleTogglePaper(p.id)}
                    >
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedPaperIds.has(p.id)}
                          onChange={() => {}} // Handled by row click
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ fontWeight: 500, color: "#e5e7eb" }}>{p.title}</div>
                        <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                          {p.authors?.slice(0, 2).join(", ")}
                        </div>
                      </td>
                      <td style={{ padding: "8px", color: "#9ca3af" }}>{p.year || "-"}</td>
                      <td style={{ padding: "8px", color: "#9ca3af" }}>{p.source || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Panel: Configuration & Output */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            overflowY: "auto",
          }}
        >
          {mode === "standard" ? (
            <>
              {mode === "standard" ? (
                <>
                  {/* Config Card */}
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "8px",
                      backgroundColor: "#0f172a",
                      border: "1px solid #1f2937",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>生成设置</h3>
    
                    <div>
                      <label style={{ display: "block", fontSize: "13px", color: "#9ca3af", marginBottom: "4px" }}>
                        综述关键词 (必填)
                      </label>
                      <input
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        placeholder="例如: Urban Design, AI, Public Space"
                        style={{
                          width: "100%",
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #334155",
                          backgroundColor: "#1e293b",
                          color: "#fff",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
    
                    <div>
                      <label style={{ display: "block", fontSize: "13px", color: "#9ca3af", marginBottom: "4px" }}>
                        自定义提示词 (可选)
                      </label>
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="例如: 请重点关注这些文献中的方法论部分..."
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #334155",
                          backgroundColor: "#1e293b",
                          color: "#fff",
                          boxSizing: "border-box",
                          resize: "vertical",
                        }}
                      />
                    </div>
    
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      style={{
                        padding: "10px",
                        borderRadius: "6px",
                        border: "none",
                        background: generating ? "#475569" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                        color: "#fff",
                        fontWeight: 600,
                        cursor: generating ? "not-allowed" : "pointer",
                        marginTop: "8px",
                      }}
                    >
                      {generating ? "正在生成综述..." : "开始生成"}
                    </button>
    
                    {error && (
                      <div
                        style={{
                          padding: "8px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid #ef4444",
                          color: "#ef4444",
                          fontSize: "13px",
                        }}
                      >
                        {error}
                      </div>
                    )}
                  </div>
    
                  {/* Output Preview */}
                  {generatedReview && (
                    <div
                      style={{
                        flex: 1,
                        padding: "16px",
                        borderRadius: "8px",
                        backgroundColor: "#0f172a",
                        border: "1px solid #1f2937",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        minHeight: "300px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#22c55e" }}>生成成功!</h3>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <span style={{ fontSize: "12px", color: "#9ca3af" }}>ID: {generatedReview.review_id}</span>
                          <button
                            onClick={() => handleExport("markdown")}
                            disabled={exporting}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              border: "1px solid #334155",
                              backgroundColor: "#1e293b",
                              color: exporting ? "#9ca3af" : "#e5e7eb",
                              fontSize: "12px",
                              cursor: exporting ? "not-allowed" : "pointer",
                            }}
                          >
                            {exporting ? "导出中..." : "导出 MD"}
                          </button>
                        </div>
                      </div>
    
                      <div
                        style={{
                          flex: 1,
                          padding: "12px",
                          backgroundColor: "#1e293b",
                          borderRadius: "4px",
                          overflowY: "auto",
                          fontSize: "14px",
                          lineHeight: "1.6",
                          whiteSpace: "pre-wrap",
                          fontFamily: "monospace",
                        }}
                      >
                        {generatedReview.preview_markdown}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <PhdPipelinePage
                  embedded={true}
                  initialPaperIds={Array.from(selectedPaperIds)}
                  initialKeywords={keywords ? keywords.split(/[,，]/).map(k => k.trim()).filter(k => k) : []}
                />
              )}
            </>
          ) : (
            <PhdPipelinePage
              embedded={true}
              initialPaperIds={Array.from(selectedPaperIds)}
            />
          )}
        </div>
      </div>
    </div>
  );
}