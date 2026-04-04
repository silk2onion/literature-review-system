import React from "react";
import { useLocale } from "../../hooks/useLocale";

interface PipelineHeaderProps {
  reviewId: number | null;
  showRagDebug: boolean;
  onToggleRagDebug: () => void;
  onExit?: () => void;
}

const PipelineHeader: React.FC<PipelineHeaderProps> = ({
  reviewId,
  showRagDebug,
  onToggleRagDebug,
  onExit,
}) => {
  const { t } = useLocale();

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <h2 style={{ color: "var(--text-primary)", margin: 0 }}>{t("phd.title")}</h2>
        {reviewId && (
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {t("phd.currentReviewId")} {reviewId}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <button
          onClick={onToggleRagDebug}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid #3b82f6",
            backgroundColor: showRagDebug
              ? "rgba(59, 130, 246, 0.08)"
              : "transparent",
            color: "#3b82f6",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          {showRagDebug ? t("phd.closeRagDebug") : t("phd.ragDebug")}
        </button>
        <button onClick={onExit} className="link-button">
          {t("phd.backToAssistant")}
        </button>
      </div>
    </div>
  );
};

export default PipelineHeader;
