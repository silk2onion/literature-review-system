import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AssembleStats } from "./types";

interface AssembleStepProps {
  citationStyle: string;
  onCitationStyleChange: (value: string) => void;
  assembleLoading: boolean;
  finalRender: string;
  reviewId: number | null;
  assembleStats: AssembleStats | null;
  fullReviewMarkdown: string;
  onAssemble: () => void;
}

const AssembleStep: React.FC<AssembleStepProps> = ({
  citationStyle,
  onCitationStyleChange,
  assembleLoading,
  finalRender,
  reviewId,
  assembleStats,
  fullReviewMarkdown,
  onAssemble,
}) => {
  return (
    <div className="pipeline-step">
      <h3>Step 4: Assemble Complete Review</h3>
      <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "12px" }}>
        Combine all rendered sections and generate a reference list.
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
          Citation Style:
        </label>
        <select
          value={citationStyle}
          onChange={(e) => onCitationStyleChange(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: "4px",
            border: "1px solid #334155",
            backgroundColor: "#1e293b",
            color: "#fff",
          }}
        >
          <option value="harvard">Harvard</option>
          <option value="apa">APA 7th</option>
          <option value="ieee">IEEE</option>
          <option value="chicago">Chicago</option>
          <option value="vancouver">Vancouver</option>
        </select>
      </div>
      <button
        onClick={onAssemble}
        disabled={assembleLoading || (!finalRender && !reviewId)}
        style={{
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          background: assembleStats
            ? "#334155"
            : "linear-gradient(135deg, #ec4899, #be185d)",
          color: "#fff",
          fontWeight: 600,
          cursor:
            assembleLoading || (!finalRender && !reviewId)
              ? "not-allowed"
              : "pointer",
          opacity: assembleLoading || (!finalRender && !reviewId) ? 0.6 : 1,
        }}
      >
        {assembleLoading
          ? "Assembling..."
          : assembleStats
            ? "Assembly Complete"
            : "Assemble Full Review"}
      </button>

      {assembleStats && (
        <div style={{ marginTop: "8px", color: "#10b981", fontSize: "13px" }}>
          Assembled {assembleStats.sections} sections, {assembleStats.cited}{" "}
          papers cited.
        </div>
      )}

      {fullReviewMarkdown && (
        <div className="step-result" style={{ marginTop: "12px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <h4>Complete Review:</h4>
            <button
              onClick={() => {
                const blob = new Blob([fullReviewMarkdown], {
                  type: "text/markdown",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `review_${reviewId || "draft"}.md`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid #334155",
                background: "transparent",
                color: "#60a5fa",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Download .md
            </button>
          </div>
          <div
            style={{
              maxHeight: "500px",
              overflow: "auto",
              padding: "16px",
              backgroundColor: "#0f172a",
              borderRadius: "8px",
              border: "1px solid #1e293b",
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {fullReviewMarkdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssembleStep;
