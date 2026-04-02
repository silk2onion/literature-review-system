import React from "react";
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
  return (
    <div className="pipeline-step">
      <h3>Step 0.5: Auto-Search Literature</h3>
      <p
        style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "12px" }}
      >
        {frameworkConfirmed
          ? "Framework confirmed. Search papers for each section using its keywords."
          : "Generate and confirm a framework first."}
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
          Papers per section:
        </label>
        <select
          value={papersPerSection}
          onChange={(e) => onPapersPerSectionChange(parseInt(e.target.value))}
          style={{
            padding: "6px 10px",
            borderRadius: "4px",
            border: "1px solid #334155",
            backgroundColor: "#1e293b",
            color: "#fff",
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
            ? "#334155"
            : "linear-gradient(135deg, #f59e0b, #d97706)",
          color: "#fff",
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
          ? "Searching..."
          : autoSearchDone
            ? "Search Complete"
            : "Auto-Search Papers"}
      </button>

      {autoSearchResults.length > 0 && (
        <div className="step-result" style={{ marginTop: "12px" }}>
          <h4>Search Results:</h4>
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
                    backgroundColor: "#1e293b",
                    borderRadius: "6px",
                    border: "1px solid #334155",
                  }}
                >
                  <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
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
                      ? "Error"
                      : `+${r.new_papers} new (${r.fetched || 0} total)`}
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
