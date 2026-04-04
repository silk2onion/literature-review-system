import React from "react";
import { useLocale } from "../../hooks/useLocale";
import { AsyncTaskPanel } from "../../AsyncTaskPanel";

interface AsyncPipelineStepProps {
  topic: string;
  keywords: string[];
  papersPerSection: number;
  sources: string[];
  citationStyle: string;
}

const AsyncPipelineStep: React.FC<AsyncPipelineStepProps> = ({
  topic,
  keywords,
  papersPerSection,
  sources,
  citationStyle,
}) => {
  const { t } = useLocale();

  return (
    <>
      <div className="pipeline-step">
        <div style={{ marginBottom: "8px" }}>
          <h3 style={{ marginBottom: "4px" }}>{t("phd.autoModeTitle")}</h3>
          <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
            {t("phd.autoModeDesc")}
          </p>
        </div>
        <AsyncTaskPanel
          topic={topic}
          keywords={keywords}
          papersPerSection={papersPerSection}
          sources={sources}
          language="zh-CN"
          citationStyle={citationStyle}
        />
      </div>

      <div
        className="pipeline-step"
        style={{ opacity: 0.7, pointerEvents: "none" }}
      >
        <div
          style={{
            padding: "8px 14px",
            background: "rgba(148,163,184,0.05)",
            border: "1px dashed #e2e8f0",
            borderRadius: "8px",
            color: "#94a3b8",
            fontSize: "12px",
            marginBottom: "12px",
            textAlign: "center",
          }}
        >
          {t("phd.orManualMode")}
        </div>
      </div>
    </>
  );
};

export default AsyncPipelineStep;
