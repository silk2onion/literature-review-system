import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocale } from "../../hooks/useLocale";
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
  const { t } = useLocale();

  return (
    <div className="pipeline-step">
      <h3>{t("phd.step4Title")}</h3>
      <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "12px" }}>
        {t("phd.step4Desc")}
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
          {t("phd.citationStyle")}
        </label>
        <select
          value={citationStyle}
          onChange={(e) => onCitationStyleChange(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
            color: "#1e293b",
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
            ? "#d1d5db"
            : "linear-gradient(135deg, #ec4899, #be185d)",
          color: assembleStats ? "#6b7280" : "#fff",
          fontWeight: 600,
          cursor:
            assembleLoading || (!finalRender && !reviewId)
              ? "not-allowed"
              : "pointer",
          opacity: assembleLoading || (!finalRender && !reviewId) ? 0.6 : 1,
        }}
      >
        {assembleLoading
          ? t("phd.assembling")
          : assembleStats
            ? t("phd.assemblyComplete")
            : t("phd.assembleFullReview")}
      </button>

      {assembleStats && (
        <div style={{ marginTop: "8px", color: "#10b981", fontSize: "13px" }}>
          {t("phd.assembledStats", {
            sections: assembleStats.sections,
            cited: assembleStats.cited,
          })}
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
            <h4 style={{ color: "var(--text-primary)" }}>{t("phd.completeReview")}:</h4>
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
                border: "1px solid #e2e8f0",
                background: "transparent",
                color: "#3b82f6",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {t("phd.downloadMd")}
            </button>
          </div>
          <div
            style={{
              maxHeight: "500px",
              overflow: "auto",
              padding: "16px",
              backgroundColor: "#f8fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
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
