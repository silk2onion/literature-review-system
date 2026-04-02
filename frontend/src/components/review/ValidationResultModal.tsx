import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import type { ValidationResult } from "../../types/review";

function severityIcon(severity: string) {
  switch (severity) {
    case "error":
      return <AlertTriangle size={14} style={{ color: "#ef4444" }} />;
    case "warning":
      return <AlertTriangle size={14} style={{ color: "#eab308" }} />;
    case "info":
      return <Info size={14} style={{ color: "#3b82f6" }} />;
    default:
      return null;
  }
}

export interface ValidationResultModalProps {
  open: boolean;
  result: ValidationResult | null;
  onClose: () => void;
}

export default function ValidationResultModal({
  open,
  result,
  onClose,
}: ValidationResultModalProps) {
  if (!open || !result) return null;

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
          maxWidth: 680,
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
            <ShieldCheck size={20} />
            引用校验结果
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
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 20,
            padding: 16,
            background: result.valid
              ? "rgba(34,197,94,0.1)"
              : "rgba(239,68,68,0.1)",
            borderRadius: 10,
            border: `1px solid ${result.valid ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          }}
        >
          {result.valid ? (
            <CheckCircle2
              size={24}
              style={{ color: "#22c55e", flexShrink: 0 }}
            />
          ) : (
            <AlertTriangle
              size={24}
              style={{ color: "#ef4444", flexShrink: 0 }}
            />
          )}
          <div>
            <p style={{ margin: 0, color: "#f1f5f9", fontWeight: 600 }}>
              {result.valid
                ? "引用校验通过 \u2713"
                : `发现 ${result.total_issues} 个问题`}
            </p>
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 13 }}>
              正文引用: {result.stats.inline_citations_found} 处 • 关联文献:{" "}
              {result.stats.linked_papers} 篇
              {result.stats.unresolved_refs > 0 &&
                ` \u2022 未解析引用: ${result.stats.unresolved_refs}`}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {result.errors > 0 && (
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background: "rgba(239,68,68,0.15)",
                color: "#fca5a5",
                fontSize: 12,
              }}
            >
              ❌ {result.errors} 错误
            </span>
          )}
          {result.warnings > 0 && (
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background: "rgba(234,179,8,0.15)",
                color: "#fde047",
                fontSize: 12,
              }}
            >
              ⚠️ {result.warnings} 警告
            </span>
          )}
          {result.info > 0 && (
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background: "rgba(59,130,246,0.15)",
                color: "#93c5fd",
                fontSize: 12,
              }}
            >
              ℹ️ {result.info} 提示
            </span>
          )}
        </div>
        {result.issues.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.issues.map((issue, idx) => (
              <div
                key={idx}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(148,163,184,0.08)",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                {severityIcon(issue.severity)}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, color: "#e2e8f0", fontSize: 13 }}>
                    {issue.message}
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      color: "#64748b",
                      fontSize: 11,
                    }}
                  >
                    {issue.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>
            🎉 没有发现任何引用问题！
          </p>
        )}
      </div>
    </div>
  );
}
