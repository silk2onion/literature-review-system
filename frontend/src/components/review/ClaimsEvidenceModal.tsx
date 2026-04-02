import { BookOpen, X } from "lucide-react";
import type { ClaimsEvidenceResponse } from "../../types/review";

export interface ClaimsEvidenceModalProps {
  open: boolean;
  data: ClaimsEvidenceResponse | null;
  onClose: () => void;
}

export default function ClaimsEvidenceModal({
  open,
  data,
  onClose,
}: ClaimsEvidenceModalProps) {
  if (!open || !data) return null;
  const claims = data.claims_evidence || {};
  const claimKeys = Object.keys(claims);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: 16,
          padding: 28,
          width: "90%",
          maxWidth: 720,
          maxHeight: "80vh",
          overflowY: "auto",
          border: "1px solid rgba(148,163,184,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#f1f5f9",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <BookOpen size={20} />
            论点-证据映射 ({String(data.total_claims ?? 0)} 条论点)
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </div>
        {claimKeys.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>
            暂无论点-证据数据。请使用 PhD 管线生成综述以获取此数据。
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {claimKeys.map((claimText, idx) => {
              const info = claims[claimText];
              const supportingIds = info.supporting_paper_ids ?? [];
              return (
                <div
                  key={idx}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(148,163,184,0.08)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      color: "#e2e8f0",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {claimText}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      color: "#94a3b8",
                      fontSize: 11,
                    }}
                  >
                    {info.section_title && (
                      <span>📄 {String(info.section_title)}</span>
                    )}
                    <span>
                      📚 {String(info.evidence_count ?? 0)} 篇支持文献
                    </span>
                    {supportingIds.length > 0 && (
                      <span>
                        IDs: [{supportingIds.filter(Boolean).join(", ")}]
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
