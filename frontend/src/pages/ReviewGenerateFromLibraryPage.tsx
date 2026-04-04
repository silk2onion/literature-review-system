import { useEffect, useState } from "react";
import PhdPipelinePage from "./PhdPipelinePage";
import { API_BASE_URL } from "../api/config";
import { useLocale } from "../hooks/useLocale";

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

export default function ReviewGenerateFromLibraryPage() {
  const { t } = useLocale();
  const [mode, setMode] = useState<"standard" | "phd">("standard");

  // --- Paper Selection State ---
  // const [sourceMode, setSourceMode] = useState<"manual" | "group">("manual");
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<PaperResponse[]>([]);
  // const [total, setTotal] = useState(0); // unused for now
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(
    new Set(),
  );

  // --- Group Selection State ---
  // const [groups, setGroups] = useState<LiteratureGroup[]>([]);
  // const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  // --- Generation State ---
  const [keywords, setKeywords] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatedReview, setGeneratedReview] =
    useState<ReviewGenerateResponse | null>(null);
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
      setError(t("review.generate.errorSelectPaper"));
      return;
    }
    if (!keywords.trim()) {
      setError(t("review.generate.errorEnterKeywords"));
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedReview(null);

    try {
      const payload = {
        keywords: keywords
          .split(/[,，]/)
          .map((k) => k.trim())
          .filter((k) => k),
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
        setError(data.message || t("review.generate.generateFailed"));
      }
    } catch (err) {
      setError(`${t("review.generate.requestFailed")}: ${err}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (format: "markdown" | "docx" | "pdf") => {
    if (!generatedReview?.review_id) return;
    setExporting(true);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/reviews/${generatedReview.review_id}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format, include_references: true }),
        },
      );
      if (!resp.ok) throw new Error("Export failed");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-${generatedReview.review_id}.${format === "markdown" ? "md" : format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert(t("review.generate.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>{t("review.generate.title")}</h1>
          <p>{t("review.generate.subtitle")}</p>
        </div>
        <div className="view-switch">
          <button
            onClick={() => setMode("standard")}
            className={`view-switch-button ${mode === "standard" ? "active" : ""}`}
          >
            {t("review.generate.standardMode")}
          </button>
          <button
            onClick={() => setMode("phd")}
            className={`view-switch-button ${mode === "phd" ? "active" : ""}`}
          >
            {t("review.generate.phdMode")}
          </button>
        </div>
      </header>

      <div className="review-workbench-container">
        {/* Left Panel: Paper Selection */}
        {/* Left Panel: Paper Selection */}
        <div className="paper-selection-panel">
          <div className="panel-header">
            <h3>{t("review.generate.selectPapers", { count: selectedPaperIds.size })}</h3>
            <div className="search-bar-small">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("review.generate.searchPlaceholder")}
                className="filter-input"
                onKeyDown={(e) => e.key === "Enter" && fetchPapers()}
              />
              <button
                onClick={fetchPapers}
                className="action-button primary small"
              >
                {t("review.generate.search")}
              </button>
            </div>
          </div>

          <div className="paper-list-container">
            {loadingPapers ? (
              <div className="loading-state">{t("common.loading")}</div>
            ) : (
              <table className="paper-list-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={
                          papers.length > 0 &&
                          selectedPaperIds.size === papers.length
                        }
                        onChange={() => {
                          if (selectedPaperIds.size === papers.length) {
                            setSelectedPaperIds(new Set());
                          } else {
                            setSelectedPaperIds(
                              new Set(papers.map((p) => p.id)),
                            );
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th>{t("review.generate.tableTitle")}</th>
                    <th style={{ width: "60px" }}>{t("review.generate.tableYear")}</th>
                    <th style={{ width: "80px" }}>{t("review.generate.tableSource")}</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((p) => (
                    <tr
                      key={p.id}
                      className={`paper-row ${selectedPaperIds.has(p.id) ? "selected" : ""}`}
                      onClick={() => handleTogglePaper(p.id)}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedPaperIds.has(p.id)}
                          onChange={() => {}} // Handled by row click
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td>
                        <div className="paper-title">{p.title}</div>
                        <div className="paper-authors">
                          {p.authors?.slice(0, 2).join(", ")}
                        </div>
                      </td>
                      <td className="paper-meta">{p.year || "-"}</td>
                      <td className="paper-meta">{p.source || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Panel: Configuration & Output */}
        {/* Right Panel: Configuration & Output */}
        <div className="config-panel">
          {mode === "standard" ? (
            <>
              {/* Config Card */}
              <div className="config-card">
                <h3>{t("review.generate.settings")}</h3>

                <div className="form-group">
                  <label>{t("review.generate.keywordsLabel")}</label>
                  <input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder={t("review.generate.keywordsPlaceholder")}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>{t("review.generate.customPromptLabel")}</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={t("review.generate.customPromptPlaceholder")}
                    rows={3}
                    className="form-textarea"
                  />
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="action-button primary full-width"
                >
                  {generating ? t("review.generate.generating") : t("review.generate.startGenerate")}
                </button>

                {error && <div className="error-message">{error}</div>}
              </div>

              {/* Output Preview */}
              {generatedReview && (
                <div className="output-preview-card">
                  <div className="card-header">
                    <h3 className="success-title">{t("review.generate.success")}</h3>
                    <div className="card-actions">
                      <span className="review-id">
                        ID: {generatedReview.review_id}
                      </span>
                      <button
                        onClick={() => handleExport("markdown")}
                        disabled={exporting}
                        className="action-button small secondary"
                      >
                        {exporting ? t("review.generate.exporting") : t("review.generate.exportMd")}
                      </button>
                    </div>
                  </div>

                  <div className="markdown-preview">
                    {generatedReview.preview_markdown}
                  </div>
                </div>
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
