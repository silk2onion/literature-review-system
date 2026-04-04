import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocale } from "../../hooks/useLocale";
import type { Claim, ClaimWithEvidence } from "./types";

interface ManualStepsProps {
  loading: boolean;
  step: number;
  claims: Claim[];
  claimsWithEvidence: ClaimWithEvidence[];
  finalRender: string;
  exportLoading: boolean;
  onGenerateClaims: () => void;
  onAttachEvidence: () => void;
  onRenderSection: () => void;
  onExportMarkdown: () => void;
}

const ManualSteps: React.FC<ManualStepsProps> = ({
  loading,
  step,
  claims,
  claimsWithEvidence,
  finalRender,
  exportLoading,
  onGenerateClaims,
  onAttachEvidence,
  onRenderSection,
  onExportMarkdown,
}) => {
  const { t } = useLocale();

  return (
    <>
      {/* Step 1: Generate Claims */}
      <div className="pipeline-step">
        <h3>{t("phd.step1Title")}</h3>
        <button
          onClick={onGenerateClaims}
          disabled={loading || claims.length > 0}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: loading && step === 1 ? "#94a3b8" : "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: loading || claims.length > 0 ? "default" : "pointer",
            opacity: claims.length > 0 ? 0.5 : 1,
          }}
        >
          {loading && step === 1 ? "生成主张中..." : claims.length > 0 ? `已生成 ${claims.length} 条主张` : t("phd.startGenerateClaims")}
        </button>
        {claims.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ color: "#0f172a", fontSize: 14, marginBottom: 8 }}>
              {t("phd.generatedClaims")} ({claims.length}):
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {claims.map((claim) => (
                <div key={claim.id} style={{
                  padding: "10px 14px", borderRadius: 8,
                  backgroundColor: "#f8fafc", border: "1px solid #e2e8f0",
                }}>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{claim.text}</p>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94a3b8" }}>
                    {claim.topic && <span>Section: {claim.topic}</span>}
                    {claim.sub_topic && <span>Query: {claim.sub_topic}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Attach Evidence */}
      <div className="pipeline-step">
        <h3>{t("phd.step2Title")}</h3>
        <button
          onClick={onAttachEvidence}
          disabled={loading || claims.length === 0 || claimsWithEvidence.length > 0}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: loading && step === 2 ? "#94a3b8" : "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: loading || claims.length === 0 || claimsWithEvidence.length > 0 ? "default" : "pointer",
            opacity: claims.length === 0 || claimsWithEvidence.length > 0 ? 0.5 : 1,
          }}
        >
          {loading && step === 2 ? "RAG 检索证据中..." : claimsWithEvidence.length > 0 ? `已关联 ${claimsWithEvidence.length} 条` : t("phd.attachEvidence")}
        </button>
        {claimsWithEvidence.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ color: "#0f172a", fontSize: 14, marginBottom: 8 }}>
              {t("phd.claimsWithEvidence")} ({claimsWithEvidence.length}):
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {claimsWithEvidence.map((claim) => (
                <div key={claim.id} style={{
                  padding: "10px 14px", borderRadius: 8,
                  backgroundColor: "#f8fafc", border: "1px solid #e2e8f0",
                }}>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{claim.text}</p>
                  {claim.evidence.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                        {t("phd.relatedEvidence")} ({claim.evidence.length}):
                      </span>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12, color: "#475569" }}>
                        {claim.evidence.slice(0, 5).map((paper) => (
                          <li key={paper.id} style={{ marginBottom: 2 }}>
                            {paper.title}
                            {paper.authors && paper.year && (
                              <span style={{ color: "#94a3b8" }}> — {paper.authors.join(", ")} ({paper.year})</span>
                            )}
                          </li>
                        ))}
                        {claim.evidence.length > 5 && (
                          <li style={{ color: "#94a3b8" }}>...and {claim.evidence.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {claim.support_snippets && claim.support_snippets.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
                      {claim.support_snippets[0].slice(0, 150)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Render Section */}
      <div className="pipeline-step">
        <h3>{t("phd.step3Title")}</h3>
        <button
          onClick={onRenderSection}
          disabled={loading || claimsWithEvidence.length === 0 || !!finalRender}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: loading && step === 3 ? "#94a3b8" : "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: loading || claimsWithEvidence.length === 0 || !!finalRender ? "default" : "pointer",
            opacity: claimsWithEvidence.length === 0 || !!finalRender ? 0.5 : 1,
          }}
        >
          {loading && step === 3 ? "LLM 渲染中..." : finalRender ? "渲染完成" : t("phd.renderSection")}
        </button>
        {finalRender && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ color: "#0f172a", fontSize: 14, marginBottom: 8 }}>{t("phd.finalReview")}:</h4>
            <div style={{
              padding: "16px 20px", borderRadius: 10,
              backgroundColor: "#ffffff", border: "1px solid #e2e8f0",
              maxHeight: 500, overflowY: "auto",
              fontSize: 14, lineHeight: 1.7, color: "#1e293b",
            }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {finalRender}
              </ReactMarkdown>
            </div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onExportMarkdown}
                disabled={exportLoading}
                style={{
                  padding: "8px 16px", borderRadius: 6, border: "none",
                  background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
                  color: "#fff", fontWeight: 600, fontSize: 13,
                  cursor: exportLoading ? "not-allowed" : "pointer",
                  opacity: exportLoading ? 0.7 : 1,
                }}
              >
                {exportLoading ? t("phd.exporting") : t("phd.exportMarkdown")}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ManualSteps;
