import React from "react";
import SemanticSearchDebugPanel from "../../SemanticSearchDebugPanel";

interface RagDebugDrawerProps {
  show: boolean;
  onClose: () => void;
}

const RagDebugDrawer: React.FC<RagDebugDrawerProps> = ({ show, onClose }) => {
  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "600px",
        height: "100vh",
        backgroundColor: "#0f172a",
        borderLeft: "1px solid #334155",
        zIndex: 1000,
        overflowY: "auto",
        boxShadow: "-4px 0 15px rgba(0,0,0,0.5)",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "10px",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: "20px",
          }}
        >
          ×
        </button>
      </div>
      <SemanticSearchDebugPanel />
    </div>
  );
};

export default RagDebugDrawer;
