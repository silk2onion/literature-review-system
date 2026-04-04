import React from "react";
import { useLocale } from "../../hooks/useLocale";

interface PipelineHeaderProps {
  reviewId: number | null;
}

const PipelineHeader: React.FC<PipelineHeaderProps> = ({ reviewId }) => {
  const { t } = useLocale();

  return (
    <div style={{ marginBottom: "20px" }}>
      <h2 style={{ color: "var(--text-primary)", margin: 0 }}>{t("phd.title")}</h2>
      {reviewId && (
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
          {t("phd.currentReviewId")} {reviewId}
        </span>
      )}
    </div>
  );
};

export default PipelineHeader;
