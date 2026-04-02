import React from "react";
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
  return (
    <>
      <div className="pipeline-step">
        <div style={{ marginBottom: "8px" }}>
          <h3 style={{ marginBottom: "4px" }}>🤖 全自动一键模式（推荐）</h3>
          <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
            全流程自动完成 · 后台运行 · 失败自动重试 · 实时进度
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
            border: "1px dashed #334155",
            borderRadius: "8px",
            color: "#475569",
            fontSize: "12px",
            marginBottom: "12px",
            textAlign: "center",
          }}
        >
          — 或选择下面的手动分步控制模式 —
        </div>
      </div>
    </>
  );
};

export default AsyncPipelineStep;
