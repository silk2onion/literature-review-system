import React from "react";
import type { Framework } from "./types";

interface FrameworkPreviewProps {
  framework: Framework | null;
  frameworkLoading: boolean;
  frameworkConfirmed: boolean;
  topicEmpty: boolean;
  onGenerate: () => void;
  onConfirm: () => void;
}

const FrameworkPreview: React.FC<FrameworkPreviewProps> = ({
  framework,
  frameworkLoading,
  frameworkConfirmed,
  topicEmpty,
  onGenerate,
  onConfirm,
}) => {
  return (
    <div className="pipeline-step">
      <h3>Step 0: Generate Review Framework</h3>
      <button
        onClick={onGenerate}
        disabled={frameworkLoading || topicEmpty || frameworkConfirmed}
        style={{
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          background: frameworkConfirmed
            ? "#334155"
            : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
          color: "#fff",
          fontWeight: 600,
          cursor:
            frameworkLoading || topicEmpty || frameworkConfirmed
              ? "not-allowed"
              : "pointer",
          opacity:
            frameworkLoading || topicEmpty || frameworkConfirmed
              ? 0.6
              : 1,
        }}
      >
        {frameworkLoading
          ? "Generating..."
          : frameworkConfirmed
            ? "Framework Confirmed"
            : "Generate Framework"}
      </button>

      {framework && (
        <div className="step-result" style={{ marginTop: "12px" }}>
          <h4>{framework.title || "Review Framework"}</h4>
          {framework.abstract_description && (
            <p
              style={{
                color: "#94a3b8",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            >
              {framework.abstract_description}
            </p>
          )}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            {(framework.sections || []).map(
              (
                sec: {
                  id: string;
                  title: string;
                  description: string;
                  search_keywords?: string[];
                },
                idx: number,
              ) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 14px",
                    backgroundColor: "#1e293b",
                    borderRadius: "6px",
                    border: "1px solid #334155",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <strong style={{ color: "#e2e8f0", fontSize: "14px" }}>
                      {sec.id}. {sec.title}
                    </strong>
                  </div>
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "12px",
                      margin: "4px 0",
                    }}
                  >
                    {sec.description}
                  </p>
                  {sec.search_keywords && (
                    <div
                      style={{
                        display: "flex",
                        gap: "4px",
                        flexWrap: "wrap",
                        marginTop: "4px",
                      }}
                    >
                      {sec.search_keywords.map((kw: string, ki: number) => (
                        <span
                          key={ki}
                          style={{
                            padding: "2px 8px",
                            backgroundColor: "rgba(139, 92, 246, 0.2)",
                            border: "1px solid rgba(139, 92, 246, 0.4)",
                            borderRadius: "12px",
                            fontSize: "11px",
                            color: "#c4b5fd",
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          {!frameworkConfirmed && (
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button
                onClick={onConfirm}
                style={{
                  padding: "8px 20px",
                  borderRadius: "6px",
                  border: "none",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Confirm Framework
              </button>
              <button
                onClick={onGenerate}
                disabled={frameworkLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #334155",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FrameworkPreview;
