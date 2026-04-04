import React from "react";
import { useLocale } from "../../hooks/useLocale";
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
  const { t } = useLocale();

  return (
    <div className="pipeline-step">
      <h3>{t("phd.step0Title")}</h3>
      <button
        onClick={onGenerate}
        disabled={frameworkLoading || topicEmpty || frameworkConfirmed}
        style={{
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          background: frameworkConfirmed
            ? "#d1d5db"
            : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
          color: frameworkConfirmed ? "#6b7280" : "#fff",
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
          ? t("phd.generating")
          : frameworkConfirmed
            ? t("phd.frameworkConfirmed")
            : t("phd.generateFramework")}
      </button>

      {framework && (
        <div className="step-result" style={{ marginTop: "12px" }}>
          <h4 style={{ color: "var(--text-primary)" }}>{framework.title || t("phd.reviewFramework")}</h4>
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
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
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
                    <strong style={{ color: "#1e293b", fontSize: "14px" }}>
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
                            backgroundColor: "rgba(139, 92, 246, 0.08)",
                            border: "1px solid rgba(139, 92, 246, 0.25)",
                            borderRadius: "12px",
                            fontSize: "11px",
                            color: "#7c3aed",
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
                {t("phd.confirmFramework")}
              </button>
              <button
                onClick={onGenerate}
                disabled={frameworkLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {t("phd.regenerate")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FrameworkPreview;
