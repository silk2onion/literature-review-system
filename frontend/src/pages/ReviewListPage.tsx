import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { API_BASE_URL } from "../api/config";
import { useAbortableFetch } from "../hooks/useAbortableFetch";
import type { Review, ValidationResult, ClaimsEvidenceResponse, EditingSection } from "../types/review";
import type { PaperInfo } from "../types/paper";
import {
  ReviewsList,
  ReviewDetail,
  ValidationResultModal,
  ClaimsEvidenceModal,
} from "../components/review";

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

  const { getSignal } = useAbortableFetch();

  // ─── Citation map ───
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

  // ─── Load paper info for citations ───
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
    [paperMap],
  );

  useEffect(() => {
    if (Object.keys(citationMap).length > 0) loadPaperInfos(citationMap);
  }, [citationMap, loadPaperInfos]);

  // ─── Fetch reviews ───
  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const signal = getSignal();
      const resp = await fetch(`${API_BASE_URL}/api/reviews/`, { signal });
      if (!resp.ok) throw new Error("Failed to fetch reviews");
      setReviews(await resp.json());
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [getSignal]);

  const fetchReviewsRef = useRef(fetchReviews);
  fetchReviewsRef.current = fetchReviews;

  useEffect(() => {
    fetchReviewsRef.current();
  }, []);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = () => setExportDropdown(null);
    if (exportDropdown !== null) {
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }
  }, [exportDropdown]);

  // ─── Handlers ───
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

  const handleExportMarkdown = async (review: Review) => {
    setExporting(review.id);
    setExportDropdown(null);
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
    setExportDropdown(null);
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
    setExportDropdown(null);
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

  const handleExportDropdownToggle = (reviewId: number) => {
    setExportDropdown(exportDropdown === reviewId ? null : reviewId);
  };

  // ─── Render ───
  return (
    <>
      {selectedReview ? (
        <ReviewDetail
          review={selectedReview}
          paperMap={paperMap}
          citationMap={citationMap}
          editingSection={editingSection}
          editText={editText}
          saving={saving}
          onStartEditing={startEditing}
          onCancelEditing={cancelEditing}
          onSaveSection={handleSaveSection}
          onSetEditText={setEditText}
          onBack={() => setSelectedReview(null)}
          validating={validating}
          onValidate={handleValidateCitations}
          onClaimsEvidence={handleViewClaimsEvidence}
          generating={generating}
          onGenerateAbstract={handleGenerateAbstract}
          onGenerateConclusion={handleGenerateConclusion}
          exporting={exporting}
          onExportMarkdown={handleExportMarkdown}
          onExportDocx={handleExportDocx}
          onExportPdf={handleExportPdf}
        />
      ) : (
        <ReviewsList
          reviews={reviews}
          selectedId={null}
          onSelect={handleOpenReview}
          onDelete={handleDelete}
          loading={loading}
          error={error}
          exporting={exporting}
          exportDropdown={exportDropdown}
          onExportDropdownToggle={handleExportDropdownToggle}
          onExportMarkdown={handleExportMarkdown}
          onExportDocx={handleExportDocx}
          onExportPdf={handleExportPdf}
          validating={validating}
          onValidate={handleValidateCitations}
        />
      )}
      <ValidationResultModal
        open={showValidation}
        result={validationResult}
        onClose={() => setShowValidation(false)}
      />
      <ClaimsEvidenceModal
        open={showClaims}
        data={claimsEvidence}
        onClose={() => setShowClaims(false)}
      />
    </>
  );
}
