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
        >
          {loading && step === 1 ? t("phd.generatingClaims") : t("phd.startGenerateClaims")}
        </button>
        {claims.length > 0 && (
          <div className="step-result">
            <h4 style={{ color: "var(--text-primary)" }}>{t("phd.generatedClaims")} ({claims.length}):</h4>
            <div className="claims-grid">
              {claims.map((claim) => (
                <div key={claim.id} className="claim-card">
                  <p>{claim.text}</p>
                  <div className="claim-meta">
                    <span>{t("phd.topic")}: {claim.topic}</span>
                    <span>{t("phd.subTopic")}: {claim.sub_topic}</span>
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
          disabled={
            loading || claims.length === 0 || claimsWithEvidence.length > 0
          }
        >
          {loading && step === 2 ? t("phd.attachingEvidence") : t("phd.attachEvidence")}
        </button>
        {claimsWithEvidence.length > 0 && (
          <div className="step-result">
            <h4 style={{ color: "var(--text-primary)" }}>{t("phd.claimsWithEvidence")} ({claimsWithEvidence.length}):</h4>
            <div className="claims-with-evidence-list">
              {claimsWithEvidence.map((claim) => (
                <div key={claim.id} className="claim-with-evidence-card">
                  <div className="claim-card-content">
                    <p>{claim.text}</p>
                    <div className="claim-meta">
                      <span>{t("phd.topic")}: {claim.topic}</span>
                      <span>{t("phd.subTopic")}: {claim.sub_topic}</span>
                    </div>
                  </div>
                  <h5>{t("phd.relatedEvidence")} ({claim.evidence.length}):</h5>
                  <ul className="evidence-list">
                    {claim.evidence.map((paper) => (
                      <li key={paper.id} className="evidence-item">
                        <span className="evidence-title">{paper.title}</span>
                        <span className="evidence-authors">
                          {paper.authors?.join(", ")} ({paper.year})
                        </span>
                      </li>
                    ))}
                  </ul>
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
          disabled={
            loading || claimsWithEvidence.length === 0 || !!finalRender
          }
        >
          {loading && step === 3 ? t("phd.rendering") : t("phd.renderSection")}
        </button>
        {finalRender && (
          <div className="step-result">
            <h4 style={{ color: "var(--text-primary)" }}>{t("phd.finalReview")}:</h4>
            <div className="final-render-container prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {finalRender}
              </ReactMarkdown>
            </div>
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={onExportMarkdown}
                disabled={exportLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff",
                  fontWeight: 600,
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
