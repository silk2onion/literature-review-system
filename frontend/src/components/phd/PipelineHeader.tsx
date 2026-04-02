import React from "react";

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
        <h2>PhD 级多阶段综述管线</h2>
        {reviewId && (
          <span style={{ fontSize: "12px", opacity: 0.7 }}>
            当前综述 ID: {reviewId}
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
              ? "rgba(59, 130, 246, 0.2)"
              : "transparent",
            color: "#3b82f6",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          {showRagDebug ? "关闭 RAG 调试" : "RAG 调试"}
        </button>
        <button onClick={onExit} className="link-button">
          返回综述助手
        </button>
      </div>
    </div>
  );
};

export default PipelineHeader;
