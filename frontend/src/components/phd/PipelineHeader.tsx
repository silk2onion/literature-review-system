import React from "react";
import { useLocale } from "../../hooks/useLocale";

interface PipelineHeaderProps {
  reviewId: number | null;
  onExit?: () => void;
}

const PipelineHeader: React.FC<PipelineHeaderProps> = ({
  reviewId,
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
        <button onClick={onExit} className="link-button">
          {t("phd.backToAssistant")}
        </button>
      </div>
    </div>
  );
};

export default PipelineHeader;
