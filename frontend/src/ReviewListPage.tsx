import { useEffect, useState, useMemo, useCallback } from "react";
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
  Edit2,
  Save,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

const API_BASE_URL = "http://localhost:5444";

interface ReferenceItem {
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

interface ReferencesJson {
  style?: string;
  items: ReferenceItem[];
}

interface Review {
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

type EditingSection = "abstract" | "conclusion" | null;

/**
 * 从完整 content 中提取纯正文 body（去除 Title / Abstract / Conclusion / References 段落）
 */
function extractBody(content: string): string {
  if (!content) return "";
  let body = content;
  // 去除开头的 # Title 行
  body = body.replace(/^#\s+[^\n]+\n*/m, "");
  // 去除 ## Abstract 段落
  body = body.replace(/## Abstract\s*\n[\s\S]*?(?=\n## (?!Abstract)|$)/i, "");
  // 去除 ## Conclusion 段落
  body = body.replace(
    /## Conclusion\s*\n[\s\S]*?(?=\n## (?!Conclusion)|$)/i,
    "",
  );
  // 去除 ## References 段落（通常在末尾）
  body = body.replace(/## References\s*\n[\s\S]*$/i, "");
  return body.trim();
}

interface PaperInfo {
  id: number;
  title: string;
  authors?: string;
  year?: number;
  journal?: string;
  doi?: string;
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

interface ClaimEvidenceItem {
  section_title?: string;
  evidence_count?: number;
  supporting_paper_ids?: Array<number | string | null | undefined>;
}

interface ClaimsEvidenceResponse {
  total_claims?: number;
  claims_evidence?: Record<string, ClaimEvidenceItem>;
}

// ─── Citation Tooltip ───
const CITATION_REGEX =
  /\(([A-Z][a-zA-Zà-ÿ\-']+(?:\s+(?:et\s+al\.|&\s+[A-Z][a-zA-Zà-ÿ\-']+))?(?:,?\s*\d{4})(?:,\s*p\.\d+)?)\)/g;

function CitationTooltip({
  citationText,
  paperInfo,
}: {
  citationText: string;
  paperInfo?: PaperInfo;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pageMatch = citationText.match(/p\.(\d+)/);
  const pageNumber = pageMatch ? parseInt(pageMatch[1]) : null;

  return (
    <span
      style={{ position: "relative", display: "inline" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        style={{
          color: paperInfo ? "#a78bfa" : "#94a3b8",
          cursor: paperInfo ? "pointer" : "default",
          borderBottom: paperInfo ? "1px dotted rgba(167,139,250,0.4)" : "none",
          transition: "color 0.2s",
        }}
      >
        ({citationText})
      </span>
      {showTooltip && paperInfo && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1e293b",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 10,
            padding: "12px 16px",
            minWidth: 300,
            maxWidth: 420,
            zIndex: 100,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 12,
              height: 12,
              background: "#1e293b",
              border: "1px solid rgba(148,163,184,0.2)",
              borderTop: "none",
              borderLeft: "none",
            }}
          />
          <p
            style={{
              margin: "0 0 6px",
              color: "#f1f5f9",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {paperInfo.title}
          </p>
          <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: 11 }}>
            {paperInfo.authors || "Unknown authors"}
            {paperInfo.year ? ` (${paperInfo.year})` : ""}
          </p>
          {paperInfo.journal && (
            <p
              style={{
                margin: "0 0 4px",
                color: "#64748b",
                fontSize: 11,
                fontStyle: "italic",
              }}
            >
              {paperInfo.journal}
            </p>
          )}
          {pageNumber && (
            <span
              style={{
                display: "inline-block",
                marginTop: 4,
                padding: "2px 8px",
                borderRadius: 4,
                background: "rgba(59,130,246,0.15)",
                color: "#93c5fd",
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              📄 Page {pageNumber}
            </span>
          )}
          {paperInfo.doi && (
            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 10 }}>
              DOI: {paperInfo.doi}
            </p>
          )}
          <span
            style={{
              display: "inline-block",
              marginTop: 4,
              marginLeft: pageNumber ? 6 : 0,
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(139,92,246,0.12)",
              color: "#a78bfa",
              fontSize: 9,
            }}
          >
            ID: {paperInfo.id}
          </span>
        </div>
      )}
    </span>
  );
}

function TextWithCitations({
  text,
  paperMap,
  citationMap,
}: {
  text: string;
  paperMap: Record<number, PaperInfo>;
  citationMap: Record<string, number>;
}) {
  const parts: (string | { citation: string; paperId?: number })[] = [];
  let lastIndex = 0;
  CITATION_REGEX.lastIndex = 0;
  let match;
  while ((match = CITATION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const fullMatch = match[0];
    const innerText = match[1];
    const paperId = citationMap[fullMatch] || citationMap[`(${innerText})`];
    parts.push({ citation: innerText, paperId });
    lastIndex = match.index + fullMatch.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return (
    <>
      {parts.map((part, idx) => {
        if (typeof part === "string") return <span key={idx}>{part}</span>;
        const info = part.paperId ? paperMap[part.paperId] : undefined;
        return (
          <CitationTooltip
            key={idx}
            citationText={part.citation}
            paperInfo={info}
          />
        );
      })}
    </>
  );
}

// ─── Main Component ───
export default function ReviewListPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [claimsEvidence, setClaimsEvidence] =
    useState<ClaimsEvidenceResponse | null>(null);
  const [showClaims, setShowClaims] = useState(false);
  const [exportDropdown, setExportDropdown] = useState<number | null>(null);
  const [paperMap, setPaperMap] = useState<Record<number, PaperInfo>>({});

  // ─── Editable sections state ───
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── Save editable section ───
  const handleSaveSection = async (
    section: "abstract" | "conclusion",
    text: string,
  ) => {
    if (!selectedReview) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      body[section] = text;
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${selectedReview.id}/sections`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) throw new Error("Save failed");
      // Refresh the review detail
      const rr = await fetch(
        `${API_BASE_URL}/api/reviews/${selectedReview.id}`,
      );
      if (rr.ok) setSelectedReview(await rr.json());
      setEditingSection(null);
      setEditText("");
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (
    section: "abstract" | "conclusion",
    currentText: string,
  ) => {
    setEditingSection(section);
    setEditText(currentText || "");
  };

  const cancelEditing = () => {
    setEditingSection(null);
    setEditText("");
  };

  const citationMap = useMemo<Record<string, number>>(() => {
    if (!selectedReview?.analysis_json?.citation_map) return {};
    const raw = selectedReview.analysis_json.citation_map;
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === "number") result[key] = val;
      else if (typeof val === "string" && !isNaN(parseInt(val)))
        result[key] = parseInt(val);
    }
    return result;
  }, [selectedReview]);

  const loadPaperInfos = useCallback(
    async (cmap: Record<string, number>) => {
      const paperIds = [...new Set(Object.values(cmap))];
      if (paperIds.length === 0) return;
      const missingIds = paperIds.filter((id) => !paperMap[id]);
      if (missingIds.length === 0) return;
      try {
        const promises = missingIds.map((id) =>
          fetch(`${API_BASE_URL}/api/papers/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        );
        const results = await Promise.all(promises);
        const newMap: Record<number, PaperInfo> = { ...paperMap };
        for (const paper of results) {
          if (paper && paper.id) {
            newMap[paper.id] = {
              id: paper.id,
              title: paper.title || "Unknown Title",
              authors: paper.authors || undefined,
              year: paper.year || paper.publication_year || undefined,
              journal: paper.journal || paper.source || undefined,
              doi: paper.doi || undefined,
            };
          }
        }
        setPaperMap(newMap);
      } catch (err) {
        console.error("Failed to load paper info for citations:", err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (Object.keys(citationMap).length > 0) loadPaperInfos(citationMap);
  }, [citationMap, loadPaperInfos]);

  const markdownComponents = useMemo(() => {
    const hasCitations = Object.keys(citationMap).length > 0;
    if (!hasCitations) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function processChildren(children: any): any {
      if (!children) return children;
      if (typeof children === "string") {
        CITATION_REGEX.lastIndex = 0;
        if (CITATION_REGEX.test(children)) {
          return (
            <TextWithCitations
              text={children}
              paperMap={paperMap}
              citationMap={citationMap}
            />
          );
        }
        return children;
      }
      if (Array.isArray(children)) {
        return children.map((child: unknown, idx: number) => {
          if (typeof child === "string") {
            CITATION_REGEX.lastIndex = 0;
            if (CITATION_REGEX.test(child)) {
              return (
                <TextWithCitations
                  key={idx}
                  text={child}
                  paperMap={paperMap}
                  citationMap={citationMap}
                />
              );
            }
          }
          return child;
        });
      }
      return children;
    }
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p: ({ children, ...props }: any) => (
        <p {...props}>{processChildren(children)}</p>
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li: ({ children, ...props }: any) => (
        <li {...props}>{processChildren(children)}</li>
      ),
    };
  }, [citationMap, paperMap]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const resp = await fetch(`${API_BASE_URL}/api/reviews/`);
      if (!resp.ok) throw new Error("Failed to fetch reviews");
      setReviews(await resp.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

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
    } catch {
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
      const blob = new Blob([data.markdown || ""], {
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

  const handleExportPdf = async (review: Review) => {
    setExporting(review.id);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${review.id}/export/pdf`,
      );
      if (!resp.ok) {
        const errData = await resp
          .json()
          .catch(() => ({ detail: "Unknown error" }));
        throw new Error(errData.detail || "PDF export failed");
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Review_${review.id}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert(
        `PDF 导出失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setExporting(null);
    }
  };

  const handleGenerateAbstract = async (reviewId: number) => {
    setGenerating("abstract");
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/generate-abstract`,
        { method: "POST" },
      );
      if (!resp.ok) throw new Error("Abstract generation failed");
      const data = await resp.json();
      alert(`✅ 摘要生成成功！\n\n${data.abstract?.substring(0, 200)}...`);
      if (selectedReview) {
        const rr = await fetch(`${API_BASE_URL}/api/reviews/${reviewId}`);
        if (rr.ok) setSelectedReview(await rr.json());
      }
      fetchReviews();
    } catch (err: unknown) {
      alert(
        `摘要生成失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateConclusion = async (reviewId: number) => {
    setGenerating("conclusion");
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/generate-conclusion`,
        { method: "POST" },
      );
      if (!resp.ok) throw new Error("Conclusion generation failed");
      const data = await resp.json();
      alert(`✅ 结论生成成功！\n\n${data.conclusion?.substring(0, 200)}...`);
      if (selectedReview) {
        const rr = await fetch(`${API_BASE_URL}/api/reviews/${reviewId}`);
        if (rr.ok) setSelectedReview(await rr.json());
      }
      fetchReviews();
    } catch (err: unknown) {
      alert(
        `结论生成失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGenerating(null);
    }
  };

  const handleValidateCitations = async (reviewId: number) => {
    setValidating(true);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/validate-citations`,
        { method: "POST" },
      );
      if (!resp.ok) throw new Error("Validation failed");
      const data: ValidationResult = await resp.json();
      setValidationResult(data);
      setShowValidation(true);
    } catch (err: unknown) {
      alert(
        `引用校验失败: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    } catch (err: unknown) {
      alert(
        `获取论点-证据数据失败: ${err instanceof Error ? err.message : String(err)}`,
      );
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
              论点-证据映射 ({String(claimsEvidence.total_claims ?? 0)} 条论点)
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
                const supportingIds = info.supporting_paper_ids ?? [];
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
                        <span>📄 {String(info.section_title)}</span>
                      )}
                      <span>
                        📚 {String(info.evidence_count ?? 0)} 篇支持文献
                      </span>
                      {supportingIds.length > 0 && (
                        <span>
                          IDs: [{supportingIds.filter(Boolean).join(", ")}]
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

  const handleOpenReview = async (review: Review) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/reviews/${review.id}`);
      if (!resp.ok) throw new Error("Failed to fetch review detail");
      const fullReview = await resp.json();
      setSelectedReview(fullReview);
    } catch (err) {
      console.error("Failed to open review detail:", err);
      setSelectedReview(review);
    }
  };

  // ─── Detail View ───
  if (selectedReview) {
    const review = selectedReview;
    // Extract body-only content (strip title/abstract/conclusion/references)
    const fullContent =
      review.content ||
      review.analysis_json?.full_markdown ||
      review.analysis_json?.sections_markdown?.join("\n\n---\n\n") ||
      "";
    const bodyContent = extractBody(fullContent);
    const hasContent = Boolean(bodyContent?.trim());

    // Conclusion: prefer independent field, fallback to analysis_json
    const conclusionText =
      review.conclusion || review.analysis_json?.conclusion || "";

    // References: prefer structured references_json, fallback to markdown
    const refsJson = review.references_json;
    const referencesMarkdownFallback =
      review.analysis_json?.references_markdown || "";

    return (
      <>
        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            padding: "24px 20px 48px",
          }}
        >
          <button
            onClick={() => setSelectedReview(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.15)",
              color: "#cbd5e1",
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} />
            返回综述列表
          </button>

          <div
            style={{
              background: "rgba(15,23,42,0.78)",
              border: "1px solid rgba(148,163,184,0.14)",
              borderRadius: 18,
              padding: 28,
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div style={{ flex: 1, minWidth: 280 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(99,102,241,0.15)",
                      color: "#c4b5fd",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <FileText size={14} />
                    Review #{review.id}
                  </span>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(34,197,94,0.12)",
                      color: "#86efac",
                      fontSize: 12,
                    }}
                  >
                    {review.status}
                  </span>
                </div>

                <h1
                  style={{
                    margin: "0 0 12px",
                    color: "#f8fafc",
                    fontSize: 30,
                    lineHeight: 1.25,
                  }}
                >
                  {review.title}
                </h1>

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Calendar size={14} />
                    {new Date(review.created_at).toLocaleString()}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <BookOpen size={14} />
                    {review.paper_count} 篇文献
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <button
                  onClick={() => handleExportMarkdown(review)}
                  disabled={exporting === review.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.15)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Download size={15} />
                  导出 Markdown
                </button>

                <button
                  onClick={() => handleExportDocx(review)}
                  disabled={exporting === review.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.15)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <FileDown size={15} />
                  导出 DOCX
                </button>

                <button
                  onClick={() => handleExportPdf(review)}
                  disabled={exporting === review.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(239,68,68,0.18)",
                    background: "rgba(239,68,68,0.08)",
                    color: "#fca5a5",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <FileDown size={15} />
                  导出 PDF
                </button>

                <button
                  onClick={() => handleGenerateAbstract(review.id)}
                  disabled={generating !== null}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(168,85,247,0.22)",
                    background: "rgba(168,85,247,0.12)",
                    color: "#e9d5ff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Sparkles size={15} />
                  {generating === "abstract" ? "生成中…" : "生成摘要"}
                </button>

                <button
                  onClick={() => handleGenerateConclusion(review.id)}
                  disabled={generating !== null}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(59,130,246,0.22)",
                    background: "rgba(59,130,246,0.12)",
                    color: "#bfdbfe",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Sparkles size={15} />
                  {generating === "conclusion" ? "生成中…" : "生成结论"}
                </button>

                <button
                  onClick={() => handleValidateCitations(review.id)}
                  disabled={validating}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(34,197,94,0.22)",
                    background: "rgba(34,197,94,0.12)",
                    color: "#bbf7d0",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <ShieldCheck size={15} />
                  {validating ? "校验中…" : "校验引用"}
                </button>

                <button
                  onClick={() => handleViewClaimsEvidence(review.id)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(245,158,11,0.22)",
                    background: "rgba(245,158,11,0.12)",
                    color: "#fde68a",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <BookOpen size={15} />
                  论点证据
                </button>
              </div>
            </div>

            {/* ─── Abstract Section (Editable) ─── */}
            <section
              style={{
                marginBottom: 20,
                padding: 18,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(148,163,184,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <h3 style={{ margin: 0, color: "#f8fafc", fontSize: 18 }}>
                  摘要
                </h3>
                {editingSection !== "abstract" ? (
                  <button
                    onClick={() =>
                      startEditing("abstract", review.abstract || "")
                    }
                    style={{
                      background: "none",
                      border: "1px solid rgba(168,85,247,0.25)",
                      borderRadius: 8,
                      color: "#c4b5fd",
                      cursor: "pointer",
                      padding: "4px 10px",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Edit2 size={12} />
                    编辑
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => handleSaveSection("abstract", editText)}
                      disabled={saving}
                      style={{
                        background: "rgba(34,197,94,0.15)",
                        border: "1px solid rgba(34,197,94,0.3)",
                        borderRadius: 8,
                        color: "#86efac",
                        cursor: "pointer",
                        padding: "4px 10px",
                        fontSize: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Save size={12} />
                      {saving ? "保存中…" : "保存"}
                    </button>
                    <button
                      onClick={cancelEditing}
                      style={{
                        background: "none",
                        border: "1px solid rgba(148,163,184,0.2)",
                        borderRadius: 8,
                        color: "#94a3b8",
                        cursor: "pointer",
                        padding: "4px 10px",
                        fontSize: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <XCircle size={12} />
                      取消
                    </button>
                  </div>
                )}
              </div>
              {editingSection === "abstract" ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 160,
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(168,85,247,0.3)",
                    borderRadius: 10,
                    color: "#e2e8f0",
                    padding: 14,
                    fontSize: 14,
                    lineHeight: 1.7,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              ) : review.abstract ? (
                <p
                  style={{
                    margin: 0,
                    color: "#cbd5e1",
                    lineHeight: 1.8,
                    fontSize: 15,
                  }}
                >
                  {review.abstract}
                </p>
              ) : (
                <p style={{ margin: 0, color: "#64748b", fontStyle: "italic" }}>
                  尚未生成摘要。点击上方「生成摘要」或「编辑」手动添加。
                </p>
              )}
            </section>

            {/* ─── Body Content Section ─── */}
            <section
              style={{
                padding: 22,
                borderRadius: 16,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(148,163,184,0.12)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 16px",
                  color: "#f8fafc",
                  fontSize: 20,
                }}
              >
                综述正文
              </h3>

              {hasContent ? (
                <div
                  style={{
                    color: "#dbeafe",
                    lineHeight: 1.9,
                    fontSize: 15,
                  }}
                >
                  <ReactMarkdown components={markdownComponents}>
                    {bodyContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <p style={{ margin: 0, color: "#94a3b8" }}>
                  该综述尚未生成正文内容。
                </p>
              )}
            </section>

            {/* ─── Conclusion Section (Editable) ─── */}
            <section
              style={{
                marginTop: 20,
                padding: 18,
                borderRadius: 14,
                background: "rgba(59,130,246,0.05)",
                border: "1px solid rgba(59,130,246,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <h3 style={{ margin: 0, color: "#f8fafc", fontSize: 18 }}>
                  结论
                </h3>
                {editingSection !== "conclusion" ? (
                  <button
                    onClick={() => startEditing("conclusion", conclusionText)}
                    style={{
                      background: "none",
                      border: "1px solid rgba(59,130,246,0.25)",
                      borderRadius: 8,
                      color: "#93c5fd",
                      cursor: "pointer",
                      padding: "4px 10px",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Edit2 size={12} />
                    编辑
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => handleSaveSection("conclusion", editText)}
                      disabled={saving}
                      style={{
                        background: "rgba(34,197,94,0.15)",
                        border: "1px solid rgba(34,197,94,0.3)",
                        borderRadius: 8,
                        color: "#86efac",
                        cursor: "pointer",
                        padding: "4px 10px",
                        fontSize: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Save size={12} />
                      {saving ? "保存中…" : "保存"}
                    </button>
                    <button
                      onClick={cancelEditing}
                      style={{
                        background: "none",
                        border: "1px solid rgba(148,163,184,0.2)",
                        borderRadius: 8,
                        color: "#94a3b8",
                        cursor: "pointer",
                        padding: "4px 10px",
                        fontSize: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <XCircle size={12} />
                      取消
                    </button>
                  </div>
                )}
              </div>
              {editingSection === "conclusion" ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 160,
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    borderRadius: 10,
                    color: "#e2e8f0",
                    padding: 14,
                    fontSize: 14,
                    lineHeight: 1.7,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              ) : conclusionText ? (
                <p
                  style={{
                    margin: 0,
                    color: "#cbd5e1",
                    lineHeight: 1.8,
                    fontSize: 15,
                  }}
                >
                  {conclusionText}
                </p>
              ) : (
                <p style={{ margin: 0, color: "#64748b", fontStyle: "italic" }}>
                  尚未生成结论。点击上方「生成结论」或「编辑」手动添加。
                </p>
              )}
            </section>

            {/* ─── References Section ─── */}
            {(refsJson?.items?.length || referencesMarkdownFallback) && (
              <section
                style={{
                  marginTop: 20,
                  padding: 22,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(148,163,184,0.12)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 16px",
                    color: "#f8fafc",
                    fontSize: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  参考文献
                  {refsJson?.style && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(99,102,241,0.12)",
                        color: "#a5b4fc",
                        fontSize: 11,
                        fontWeight: 500,
                        textTransform: "uppercase",
                      }}
                    >
                      {refsJson.style}
                    </span>
                  )}
                </h3>
                <div
                  style={{
                    color: "#cbd5e1",
                    lineHeight: 1.8,
                    fontSize: 14,
                  }}
                >
                  {refsJson?.items?.length ? (
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 24,
                        listStyleType: "decimal",
                      }}
                    >
                      {refsJson.items
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((ref, idx) => (
                          <li
                            key={idx}
                            style={{
                              marginBottom: 8,
                              paddingLeft: 4,
                            }}
                          >
                            {ref.formatted}
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <ReactMarkdown components={markdownComponents}>
                      {referencesMarkdownFallback}
                    </ReactMarkdown>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
        <ValidationModal />
        <ClaimsModal />
      </>
    );
  }

  // ─── List View ───
  return (
    <>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "24px 20px 48px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: "0 0 8px",
                color: "#f8fafc",
                fontSize: 30,
              }}
            >
              文献综述库
            </h1>
            <p style={{ margin: 0, color: "#94a3b8" }}>
              查看、导出、校验并管理已生成的综述结果。
            </p>
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(99,102,241,0.12)",
              color: "#c4b5fd",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            共 {reviews.length} 份综述
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: 40,
              borderRadius: 16,
              textAlign: "center",
              color: "#94a3b8",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(148,163,184,0.12)",
            }}
          >
            正在加载综述列表…
          </div>
        ) : error ? (
          <div
            style={{
              padding: 24,
              borderRadius: 16,
              color: "#fecaca",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.16)",
            }}
          >
            加载失败：{error}
          </div>
        ) : reviews.length === 0 ? (
          <div
            style={{
              padding: 40,
              borderRadius: 16,
              textAlign: "center",
              color: "#94a3b8",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(148,163,184,0.12)",
            }}
          >
            <FileText size={28} style={{ marginBottom: 12 }} />
            <div>暂时还没有生成好的综述。</div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: 18,
            }}
          >
            {reviews.map((review) => (
              <div
                key={review.id}
                style={{
                  background: "rgba(15,23,42,0.78)",
                  border: "1px solid rgba(148,163,184,0.14)",
                  borderRadius: 18,
                  padding: 20,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        margin: "0 0 8px",
                        color: "#f8fafc",
                        fontSize: 20,
                        lineHeight: 1.35,
                      }}
                    >
                      {review.title}
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        color: "#94a3b8",
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Calendar size={13} />
                        {new Date(review.created_at).toLocaleDateString()}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <BookOpen size={13} />
                        {review.paper_count} 篇文献
                      </span>
                    </div>
                  </div>

                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(34,197,94,0.12)",
                      color: "#86efac",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {review.status}
                  </span>
                </div>

                {review.abstract && (
                  <p
                    style={{
                      margin: "0 0 16px",
                      color: "#cbd5e1",
                      fontSize: 14,
                      lineHeight: 1.7,
                    }}
                  >
                    {review.abstract.length > 180
                      ? `${review.abstract.slice(0, 180)}...`
                      : review.abstract}
                  </p>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    position: "relative",
                  }}
                >
                  <button
                    onClick={() => handleOpenReview(review)}
                    title="查看详情"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(148,163,184,0.15)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#e2e8f0",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ExternalLink size={15} />
                    详情
                  </button>

                  <div style={{ position: "relative" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExportDropdown(
                          exportDropdown === review.id ? null : review.id,
                        );
                      }}
                      title="导出"
                      disabled={exporting === review.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(148,163,184,0.15)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Download size={15} />
                      导出
                    </button>

                    {exportDropdown === review.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          background: "#1e293b",
                          borderRadius: 10,
                          border: "1px solid rgba(148,163,184,0.15)",
                          padding: 6,
                          zIndex: 30,
                          minWidth: 160,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
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
                            padding: "9px 12px",
                            background: "none",
                            border: "none",
                            color: "#e2e8f0",
                            cursor: "pointer",
                            borderRadius: 8,
                            fontSize: 13,
                          }}
                        >
                          <Download size={14} />
                          Markdown (.md)
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
                            padding: "9px 12px",
                            background: "none",
                            border: "none",
                            color: "#e2e8f0",
                            cursor: "pointer",
                            borderRadius: 8,
                            fontSize: 13,
                          }}
                        >
                          <FileDown size={14} />
                          Word (.docx)
                        </button>
                        <button
                          onClick={() => {
                            setExportDropdown(null);
                            handleExportPdf(review);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            padding: "9px 12px",
                            background: "none",
                            border: "none",
                            color: "#e2e8f0",
                            cursor: "pointer",
                            borderRadius: 8,
                            fontSize: 13,
                          }}
                        >
                          <FileDown size={14} />
                          PDF (.pdf)
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleValidateCitations(review.id)}
                    disabled={validating}
                    title="校验引用"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(34,197,94,0.22)",
                      background: "rgba(34,197,94,0.12)",
                      color: "#bbf7d0",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ShieldCheck size={15} />
                    校验
                  </button>

                  <button
                    onClick={() => handleDelete(review.id)}
                    title="删除"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(239,68,68,0.18)",
                      background: "rgba(239,68,68,0.08)",
                      color: "#fca5a5",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ValidationModal />
      <ClaimsModal />
    </>
  );
}
