import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  return (
    <>
      {/* Step 1: Generate Claims */}
      <div className="pipeline-step">
        <h3>步骤 1: 生成主张 (Claims)</h3>
        <button
          onClick={onGenerateClaims}
          disabled={loading || claims.length > 0}
        >
          {loading && step === 1 ? "生成中..." : "开始生成主张"}
        </button>
        {claims.length > 0 && (
          <div className="step-result">
            <h4>生成的主张 ({claims.length}):</h4>
            <div className="claims-grid">
              {claims.map((claim) => (
                <div key={claim.id} className="claim-card">
                  <p>{claim.text}</p>
                  <div className="claim-meta">
                    <span>主题: {claim.topic}</span>
                    <span>子主题: {claim.sub_topic}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Attach Evidence */}
      <div className="pipeline-step">
        <h3>步骤 2: 关联证据 (Evidence)</h3>
        <button
          onClick={onAttachEvidence}
          disabled={
            loading || claims.length === 0 || claimsWithEvidence.length > 0
          }
        >
          {loading && step === 2 ? "关联中..." : "为上述主张关联证据"}
        </button>
        {claimsWithEvidence.length > 0 && (
          <div className="step-result">
            <h4>带证据的主张 ({claimsWithEvidence.length}):</h4>
            <div className="claims-with-evidence-list">
              {claimsWithEvidence.map((claim) => (
                <div key={claim.id} className="claim-with-evidence-card">
                  <div className="claim-card-content">
                    <p>{claim.text}</p>
                    <div className="claim-meta">
                      <span>主题: {claim.topic}</span>
                      <span>子主题: {claim.sub_topic}</span>
                    </div>
                  </div>
                  <h5>关联证据 ({claim.evidence.length}):</h5>
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
        <h3>步骤 3: 渲染最终综述</h3>
        <button
          onClick={onRenderSection}
          disabled={
            loading || claimsWithEvidence.length === 0 || !!finalRender
          }
        >
          {loading && step === 3 ? "渲染中..." : "渲染最终综述章节"}
        </button>
        {finalRender && (
          <div className="step-result">
            <h4>最终综述:</h4>
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
                {exportLoading ? "导出中..." : "导出 Markdown"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ManualSteps;
