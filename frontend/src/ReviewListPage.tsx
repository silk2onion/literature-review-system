import { useEffect, useState } from "react";
import {
  FileText,
  Trash2,
  ExternalLink,
  Download,
  Calendar,
  BookOpen,
  ArrowLeft,
  FileDown,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

const API_BASE_URL = "http://localhost:5444";

interface Review {
  id: number;
  title: string;
  status: string;
  paper_count: number;
  created_at: string;
  abstract?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis_json?: any;
  content?: string;
  framework?: string;
}

interface ValidationIssue {
  type: string;
  severity: "error" | "warning" | "info";
  message: string;
  paper_id?: number;
  location?: string;
  ref_key?: string;
}

interface ValidationResult {
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

export default function ReviewListPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [generating, setGenerating] = useState<string | null>(null); // "abstract" | "conclusion" | null
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [claimsEvidence, setClaimsEvidence] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [showClaims, setShowClaims] = useState(false);
  const [exportDropdown, setExportDropdown] = useState<number | null>(null);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const resp = await fetch(`${API_BASE_URL}/api/reviews/`);
      if (!resp.ok) throw new Error("Failed to fetch reviews");
      const data = await resp.json();
      setReviews(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handler = () => setExportDropdown(null);
    if (exportDropdown !== null) {
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }
  }, [exportDropdown]);

  const handleDelete = async (id: number) => {
    if (!confirm("确定要永久删除这份文献综述吗？")) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/reviews/${id}`, {
        method: "DELETE",
      });
      if (resp.ok) {
        setReviews(reviews.filter((r) => r.id !== id));
        if (selectedReview?.id === id) setSelectedReview(null);
      }
    } catch (err) {
      alert("删除失败");
    }
  };

  const handleExportMarkdown = async (review: Review) => {
    setExporting(review.id);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${review.id}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format: "markdown",
            include_references: true,
          }),
        },
      );
      if (!resp.ok) throw new Error("Export failed");

      const data = await resp.json();
      const markdown = data.markdown || "";
      const blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Review_${review.id}_${new Date().toISOString().split("T")[0]}.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Markdown 导出失败");
    } finally {
      setExporting(null);
    }
  };

  const handleExportDocx = async (review: Review) => {
    setExporting(review.id);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${review.id}/export/docx`,
      );
      if (!resp.ok) throw new Error("DOCX export failed");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Review_${review.id}_${new Date().toISOString().split("T")[0]}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("DOCX 导出失败");
    } finally {
      setExporting(null);
    }
  };

  const handleGenerateAbstract = async (reviewId: number) => {
    setGenerating("abstract");
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/generate-abstract`,
        {
          method: "POST",
        },
      );
      if (!resp.ok) throw new Error("Abstract generation failed");
      const data = await resp.json();
      alert(`✅ 摘要生成成功！\n\n${data.abstract?.substring(0, 200)}...`);
      // Refresh review data
      if (selectedReview) {
        const refreshResp = await fetch(
          `${API_BASE_URL}/api/reviews/${reviewId}`,
        );
        if (refreshResp.ok) {
          const updated = await refreshResp.json();
          setSelectedReview(updated);
        }
      }
      fetchReviews();
    } catch (err: any) {
      alert(`摘要生成失败: ${err.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateConclusion = async (reviewId: number) => {
    setGenerating("conclusion");
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/generate-conclusion`,
        {
          method: "POST",
        },
      );
      if (!resp.ok) throw new Error("Conclusion generation failed");
      const data = await resp.json();
      alert(`✅ 结论生成成功！\n\n${data.conclusion?.substring(0, 200)}...`);
      // Refresh review data
      if (selectedReview) {
        const refreshResp = await fetch(
          `${API_BASE_URL}/api/reviews/${reviewId}`,
        );
        if (refreshResp.ok) {
          const updated = await refreshResp.json();
          setSelectedReview(updated);
        }
      }
      fetchReviews();
    } catch (err: any) {
      alert(`结论生成失败: ${err.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const handleValidateCitations = async (reviewId: number) => {
    setValidating(true);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/validate-citations`,
        {
          method: "POST",
        },
      );
      if (!resp.ok) throw new Error("Validation failed");
      const data: ValidationResult = await resp.json();
      setValidationResult(data);
      setShowValidation(true);
    } catch (err: any) {
      alert(`引用校验失败: ${err.message}`);
    } finally {
      setValidating(false);
    }
  };

  const handleViewClaimsEvidence = async (reviewId: number) => {
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/claims-evidence`,
      );
      if (!resp.ok) throw new Error("Failed to fetch claims evidence");
      const data = await resp.json();
      setClaimsEvidence(data);
      setShowClaims(true);
    } catch (err: any) {
      alert(`获取论点-证据数据失败: ${err.message}`);
    }
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertTriangle size={14} style={{ color: "#ef4444" }} />;
      case "warning":
        return <AlertTriangle size={14} style={{ color: "#eab308" }} />;
      case "info":
        return <Info size={14} style={{ color: "#3b82f6" }} />;
      default:
        return null;
    }
  };

  // ─── Validation Modal ───
  const ValidationModal = () => {
    if (!showValidation || !validationResult) return null;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={() => setShowValidation(false)}
      >
        <div
          style={{
            background: "#1e293b",
            borderRadius: 16,
            padding: 28,
            width: "90%",
            maxWidth: 680,
            maxHeight: "80vh",
            overflowY: "auto",
            border: "1px solid rgba(148,163,184,0.15)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#f1f5f9",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ShieldCheck size={20} />
              引用校验结果
            </h2>
            <button
              onClick={() => setShowValidation(false)}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Summary */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 20,
              padding: 16,
              background: validationResult.valid
                ? "rgba(34,197,94,0.1)"
                : "rgba(239,68,68,0.1)",
              borderRadius: 10,
              border: `1px solid ${validationResult.valid ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}
          >
            {validationResult.valid ? (
              <CheckCircle2
                size={24}
                style={{ color: "#22c55e", flexShrink: 0 }}
              />
            ) : (
              <AlertTriangle
                size={24}
                style={{ color: "#ef4444", flexShrink: 0 }}
              />
            )}
            <div>
              <p style={{ margin: 0, color: "#f1f5f9", fontWeight: 600 }}>
                {validationResult.valid
                  ? "引用校验通过 ✓"
                  : `发现 ${validationResult.total_issues} 个问题`}
              </p>
              <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 13 }}>
                正文引用: {validationResult.stats.inline_citations_found} 处 •
                关联文献: {validationResult.stats.linked_papers} 篇
                {validationResult.stats.unresolved_refs > 0 &&
                  ` • 未解析引用: ${validationResult.stats.unresolved_refs}`}
              </p>
            </div>
          </div>

          {/* Stats badges */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {validationResult.errors > 0 && (
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(239,68,68,0.15)",
                  color: "#fca5a5",
                  fontSize: 12,
                }}
              >
                ❌ {validationResult.errors} 错误
              </span>
            )}
            {validationResult.warnings > 0 && (
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(234,179,8,0.15)",
                  color: "#fde047",
                  fontSize: 12,
                }}
              >
                ⚠️ {validationResult.warnings} 警告
              </span>
            )}
            {validationResult.info > 0 && (
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(59,130,246,0.15)",
                  color: "#93c5fd",
                  fontSize: 12,
                }}
              >
                ℹ️ {validationResult.info} 提示
              </span>
            )}
          </div>

          {/* Issues list */}
          {validationResult.issues.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {validationResult.issues.map((issue, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(148,163,184,0.08)",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  {severityIcon(issue.severity)}
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, color: "#e2e8f0", fontSize: 13 }}>
                      {issue.message}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        color: "#64748b",
                        fontSize: 11,
                      }}
                    >
                      {issue.type}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#94a3b8", textAlign: "center" }}>
              🎉 没有发现任何引用问题！
            </p>
          )}
        </div>
      </div>
    );
  };

  // ─── Claims Evidence Modal ───
  const ClaimsModal = () => {
    if (!showClaims || !claimsEvidence) return null;
    const claims = claimsEvidence.claims_evidence || {};
    const claimKeys = Object.keys(claims);

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={() => setShowClaims(false)}
      >
        <div
          style={{
            background: "#1e293b",
            borderRadius: 16,
            padding: 28,
            width: "90%",
            maxWidth: 720,
            maxHeight: "80vh",
            overflowY: "auto",
            border: "1px solid rgba(148,163,184,0.15)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#f1f5f9",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <BookOpen size={20} />
              论点-证据映射 ({claimsEvidence.total_claims} 条论点)
            </h2>
            <button
              onClick={() => setShowClaims(false)}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
              }}
            >
              <X size={20} />
            </button>
          </div>

          {claimKeys.length === 0 ? (
            <p style={{ color: "#94a3b8", textAlign: "center" }}>
              暂无论点-证据数据。请使用 PhD 管线生成综述以获取此数据。
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {claimKeys.map((claimText, idx) => {
                const info = claims[claimText];
                return (
                  <div
                    key={idx}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(148,163,184,0.08)",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 6px",
                        color: "#e2e8f0",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {claimText}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        color: "#94a3b8",
                        fontSize: 11,
                      }}
                    >
                      {info.section_title && (
                        <span>📄 {info.section_title}</span>
                      )}
                      <span>📚 {info.evidence_count} 篇支持文献</span>
                      {info.supporting_paper_ids?.length > 0 && (
                        <span>
                          IDs: [
                          {info.supporting_paper_ids.filter(Boolean).join(", ")}
                          ]
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Detail View ───
  if (selectedReview) {
    return (
      <div
        className="page-container"
        style={{ padding: "20px 40px", overflowY: "auto" }}
      >
        <ValidationModal />
        <ClaimsModal />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => setSelectedReview(null)}
            className="icon-button"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, margin: 0, color: "#e2e8f0" }}>
              {selectedReview.title}
            </h1>
            <p style={{ color: "#94a3b8", margin: "4px 0 0 0" }}>
              Review #{selectedReview.id} •{" "}
              {new Date(selectedReview.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Action Bar */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
            padding: "14px 18px",
            background: "rgba(30,41,59,0.6)",
            borderRadius: 12,
            border: "1px solid rgba(148,163,184,0.08)",
          }}
        >
          {/* Export Group */}
          <button
            className="action-button secondary"
            onClick={() => handleExportMarkdown(selectedReview)}
            disabled={exporting === selectedReview.id}
          >
            <Download size={14} style={{ marginRight: 6 }} />
            {exporting === selectedReview.id ? "导出中..." : "导出 MD"}
          </button>
          <button
            className="action-button secondary"
            onClick={() => handleExportDocx(selectedReview)}
            disabled={exporting === selectedReview.id}
          >
            <FileDown size={14} style={{ marginRight: 6 }} />
            导出 DOCX
          </button>

          <div
            style={{
              width: 1,
              background: "rgba(148,163,184,0.15)",
              margin: "0 4px",
            }}
          />

          {/* Generate Group */}
          <button
            className="action-button secondary"
            onClick={() => handleGenerateAbstract(selectedReview.id)}
            disabled={generating !== null}
            style={{ color: "#a78bfa" }}
          >
            <Sparkles size={14} style={{ marginRight: 6 }} />
            {generating === "abstract" ? "生成中..." : "生成摘要"}
          </button>
          <button
            className="action-button secondary"
            onClick={() => handleGenerateConclusion(selectedReview.id)}
            disabled={generating !== null}
            style={{ color: "#a78bfa" }}
          >
            <Sparkles size={14} style={{ marginRight: 6 }} />
            {generating === "conclusion" ? "生成中..." : "生成结论"}
          </button>

          <div
            style={{
              width: 1,
              background: "rgba(148,163,184,0.15)",
              margin: "0 4px",
            }}
          />

          {/* Validation & Claims */}
          <button
            className="action-button secondary"
            onClick={() => handleValidateCitations(selectedReview.id)}
            disabled={validating}
            style={{ color: "#22c55e" }}
          >
            <ShieldCheck size={14} style={{ marginRight: 6 }} />
            {validating ? "校验中..." : "校验引用"}
          </button>
          <button
            className="action-button secondary"
            onClick={() => handleViewClaimsEvidence(selectedReview.id)}
            style={{ color: "#f59e0b" }}
          >
            <BookOpen size={14} style={{ marginRight: 6 }} />
            论点-证据
          </button>
        </div>

        {/* Abstract Preview */}
        {selectedReview.abstract && (
          <div
            style={{
              marginBottom: 20,
              padding: "16px 20px",
              background: "rgba(139,92,246,0.06)",
              borderRadius: 10,
              border: "1px solid rgba(139,92,246,0.15)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", color: "#a78bfa", fontSize: 14 }}>
              📋 Abstract
            </h3>
            <p
              style={{
                margin: 0,
                color: "#cbd5e1",
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              {selectedReview.abstract}
            </p>
          </div>
        )}

        {/* Content */}
        <div
          className="result-card"
          style={{
            padding: 32,
            background: "rgba(15, 23, 42, 0.4)",
            borderRadius: 12,
          }}
        >
          <div className="markdown-body">
            <ReactMarkdown>
              {selectedReview.content ||
                selectedReview.analysis_json?.markdown ||
                selectedReview.framework ||
                "# 无内容可显示"}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // ─── List View ───
  return (
    <div
      className="page-container"
      style={{ padding: "24px 32px", overflowY: "auto" }}
    >
      <ValidationModal />
      <ClaimsModal />

      <header className="page-header" style={{ marginBottom: 32 }}>
        <div className="page-title">
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FileText className="purple" />
            文献综述书架
          </h1>
          <p>查看并下载所有已生成的深度综述与编排结果</p>
        </div>
      </header>

      {loading ? (
        <div className="loading-state">正在查找您的研究成果...</div>
      ) : error ? (
        <div className="error-message">❌ 加载库失败: {error}</div>
      ) : reviews.length === 0 ? (
        <div
          style={{ textAlign: "center", padding: "80px 0", color: "#64748b" }}
        >
          <BookOpen size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p>您的书架目前空空如也。</p>
          <p style={{ fontSize: 13 }}>
            快去使用"一键综述生成"或"科研管线"开启您的第一个大作吧！
          </p>
        </div>
      ) : (
        <div
          className="review-list"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {reviews.map((review) => (
            <div
              key={review.id}
              className="review-item-card"
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                borderRadius: 12,
                padding: "20px 24px",
                border: "1px solid rgba(148, 163, 184, 0.1)",
                display: "flex",
                alignItems: "center",
                transition: "all 0.2s",
                gap: 20,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  background: "rgba(139, 92, 246, 0.1)",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#a78bfa",
                }}
              >
                <FileText size={22} />
              </div>

              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: "0 0 6px 0",
                    color: "#f1f5f9",
                    fontSize: 16,
                  }}
                >
                  {review.title}
                </h3>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    color: "#94a3b8",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <Calendar size={13} />
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <BookOpen size={13} />
                    引用 {review.paper_count} 篇文献
                  </span>
                  <span
                    style={{
                      color:
                        review.status === "completed" ? "#22c55e" : "#eab308",
                    }}
                  >
                    ● {review.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, position: "relative" }}>
                {/* View detail */}
                <button
                  onClick={() => setSelectedReview(review)}
                  title="查看详情"
                  className="icon-button"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <ExternalLink size={16} />
                </button>

                {/* Export dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportDropdown(
                        exportDropdown === review.id ? null : review.id,
                      );
                    }}
                    title="导出"
                    className="icon-button"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                    disabled={exporting === review.id}
                  >
                    <Download size={16} />
                  </button>
                  {exportDropdown === review.id && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 4,
                        background: "#1e293b",
                        borderRadius: 8,
                        border: "1px solid rgba(148,163,184,0.15)",
                        padding: 4,
                        zIndex: 50,
                        minWidth: 140,
                      }}
                    >
                      <button
                        onClick={() => {
                          setExportDropdown(null);
                          handleExportMarkdown(review);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "8px 12px",
                          background: "none",
                          border: "none",
                          color: "#e2e8f0",
                          cursor: "pointer",
                          borderRadius: 6,
                          fontSize: 13,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(255,255,255,0.06)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "none")
                        }
                      >
                        <Download size={14} /> Markdown (.md)
                      </button>
                      <button
                        onClick={() => {
                          setExportDropdown(null);
                          handleExportDocx(review);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "8px 12px",
                          background: "none",
                          border: "none",
                          color: "#e2e8f0",
                          cursor: "pointer",
                          borderRadius: 6,
                          fontSize: 13,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(255,255,255,0.06)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "none")
                        }
                      >
                        <FileDown size={14} /> Word (.docx)
                      </button>
                    </div>
                  )}
                </div>

                {/* Validate */}
                <button
                  onClick={() => handleValidateCitations(review.id)}
                  title="校验引用"
                  className="icon-button"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                  disabled={validating}
                >
                  <ShieldCheck size={16} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(review.id)}
                  title="删除"
                  className="icon-button"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    color: "#f87171",
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
