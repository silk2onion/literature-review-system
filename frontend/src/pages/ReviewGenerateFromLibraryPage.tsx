import { useEffect, useState, useMemo } from "react";
import PhdPipelinePage from "./PhdPipelinePage";
import { useLocale } from "../hooks/useLocale";
import { ChevronRight, ChevronLeft, BookOpen } from "lucide-react";
import { papersApi } from "../api/papers";
import type { PaperResponse } from "../types/paper";

export default function ReviewGenerateFromLibraryPage() {
  const { t } = useLocale();

  const [showPaperBrowser, setShowPaperBrowser] = useState(false);
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<PaperResponse[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(
    new Set(),
  );

  const fetchPapers = async () => {
    try {
      setLoadingPapers(true);
      const { data } = await papersApi.searchLocal({
        q: query.trim() || undefined,
        page: 1,
        page_size: 100,
      });
      setPapers(data?.items || []);
    } catch (err) {
      console.error("Failed to fetch papers", err);
    } finally {
      setLoadingPapers(false);
    }
  };

  useEffect(() => {
    if (showPaperBrowser && papers.length === 0) {
      fetchPapers();
    }
  }, [showPaperBrowser]);

  const handleTogglePaper = (id: number) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Memoize to avoid creating new array reference on every render
  const paperIdsArray = useMemo(
    () => Array.from(selectedPaperIds),
    [selectedPaperIds],
  );

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "row", overflow: "hidden" }}>
      {/* Main: PhD Pipeline */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        <PhdPipelinePage
          embedded={true}
          initialPaperIds={paperIdsArray}
        />
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setShowPaperBrowser(!showPaperBrowser)}
        title={showPaperBrowser ? t("review.generate.closeBrowser") : t("review.generate.openBrowser")}
        style={{
          width: 28, minWidth: 28, border: "none",
          borderLeft: "1px solid var(--border-color)",
          background: showPaperBrowser ? "rgba(59,130,246,0.04)" : "var(--bg-secondary)",
          cursor: "pointer", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 6,
          padding: "8px 0", color: "var(--text-secondary)", transition: "background 0.15s",
        }}
      >
        <BookOpen size={14} />
        {showPaperBrowser ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Right: Paper Browser (collapsible) */}
      {showPaperBrowser && (
        <div
          style={{
            width: 380, minWidth: 380,
            borderLeft: "1px solid var(--border-color)",
            display: "flex", flexDirection: "column",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <div style={{
            padding: "14px 16px", borderBottom: "1px solid var(--border-color)",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {t("review.generate.paperBrowser")}
              </span>
              {selectedPaperIds.size > 0 && (
                <span style={{
                  fontSize: 11, color: "#3b82f6", fontWeight: 500,
                  padding: "2px 8px", backgroundColor: "rgba(59,130,246,0.08)", borderRadius: 10,
                }}>
                  {t("review.generate.selected", { count: selectedPaperIds.size })}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("review.generate.searchPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && fetchPapers()}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 6,
                  border: "1px solid var(--border-color)", fontSize: 12,
                  backgroundColor: "var(--bg-primary)",
                }}
              />
              <button
                onClick={fetchPapers}
                style={{
                  padding: "7px 12px", borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-primary)", cursor: "pointer",
                  fontSize: 12, color: "var(--text-primary)",
                }}
              >
                {t("review.generate.search")}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {loadingPapers ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                {t("common.loading")}
              </div>
            ) : papers.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                {t("review.generate.noPapers")}
              </div>
            ) : (
              papers.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleTogglePaper(p.id)}
                  style={{
                    padding: "10px 16px", cursor: "pointer",
                    borderBottom: "1px solid var(--border-color)",
                    backgroundColor: selectedPaperIds.has(p.id) ? "rgba(59,130,246,0.06)" : "transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedPaperIds.has(p.id)}
                      onChange={() => {}}
                      style={{ marginTop: 3, cursor: "pointer", flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 500, color: "var(--text-primary)",
                        lineHeight: 1.4, overflow: "hidden",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        {p.authors?.slice(0, 2).join(", ")}
                        {p.year ? ` · ${p.year}` : ""}
                        {p.source ? ` · ${p.source}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
