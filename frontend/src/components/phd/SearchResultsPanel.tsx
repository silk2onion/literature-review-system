import React from "react";
import { useLocale } from "../../hooks/useLocale";
import type { AutoSearchResult } from "./types";

interface SearchResultsPanelProps {
  frameworkConfirmed: boolean;
  papersPerSection: number;
  onPapersPerSectionChange: (value: number) => void;
  autoSearchLoading: boolean;
  autoSearchDone: boolean;
  autoSearchResults: AutoSearchResult[];
  onAutoSearch: () => void;
}

const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
  frameworkConfirmed,
  papersPerSection,
  onPapersPerSectionChange,
  autoSearchLoading,
  autoSearchDone,
  autoSearchResults,
  onAutoSearch,
}) => {
  const { t } = useLocale();

  return (
    <div className="pipeline-step">
      <h3>{t("phd.step05Title")}</h3>
      <p
        style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "12px" }}
      >
        {frameworkConfirmed
          ? t("phd.step05ConfirmedDesc")
          : t("phd.step05PendingDesc")}
      </p>
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <label style={{ color: "#9ca3af", fontSize: "13px" }}>
          {t("phd.papersPerSection")}
        </label>
        <select
          value={papersPerSection}
          onChange={(e) => onPapersPerSectionChange(parseInt(e.target.value))}
          style={{
            padding: "6px 10px",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
            color: "#1e293b",
          }}
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
        </select>
      </div>
      <button
        onClick={onAutoSearch}
        disabled={
          autoSearchLoading || !frameworkConfirmed || autoSearchDone
        }
        style={{
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          background: autoSearchDone
            ? "#d1d5db"
            : "linear-gradient(135deg, #f59e0b, #d97706)",
          color: autoSearchDone ? "#6b7280" : "#fff",
          fontWeight: 600,
          cursor:
            autoSearchLoading || !frameworkConfirmed || autoSearchDone
              ? "not-allowed"
              : "pointer",
          opacity:
            autoSearchLoading || !frameworkConfirmed || autoSearchDone
              ? 0.6
              : 1,
        }}
      >
        {autoSearchLoading
          ? t("phd.searching")
          : autoSearchDone
            ? t("phd.searchComplete")
            : t("phd.autoSearch")}
      </button>

      {autoSearchResults.length > 0 && (
        <div className="step-result" style={{ marginTop: "12px" }}>
          <h4 style={{ color: "var(--text-primary)" }}>{t("phd.searchResults")}</h4>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "6px" }}
          >
            {autoSearchResults.map(
              (r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <span style={{ color: "#1e293b", fontSize: "13px" }}>
                    {r.section_title}
                  </span>
                  <span
                    style={{
                      color: r.error ? "#ef4444" : "#10b981",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {r.error
                      ? t("phd.error")
                      : `+${r.new_papers} ${t("phd.newPapers")} (${r.fetched || 0} ${t("phd.total")})`}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchResultsPanel;
