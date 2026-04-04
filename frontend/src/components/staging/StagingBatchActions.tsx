import { useLocale } from "../../hooks/useLocale";

interface StagingBatchActionsProps {
  selectedCount: number;
  promoting: boolean;
  aiScreening?: boolean;
  enriching?: boolean;
  taskStatus: "idle" | "running" | "done" | "error";
  taskMessage: string;
  onRefresh: () => void;
  onDeleteClick: () => void;
  onRejectClick: () => void;
  onPromote: () => void;
  onAIScreen?: () => void;
  onEnrich?: () => void;
}

export default function StagingBatchActions({
  selectedCount,
  promoting,
  aiScreening,
  enriching,
  taskStatus,
  taskMessage,
  onRefresh,
  onDeleteClick,
  onRejectClick,
  onPromote,
  onAIScreen,
  onEnrich,
}: StagingBatchActionsProps) {
  const { t } = useLocale();

  const renderTaskBadge = () => {
    if (taskStatus === "idle") return null;
    let color = "#64748b";
    if (taskStatus === "running") color = "#0ea5e9";
    if (taskStatus === "done") color = "#22c55e";
    if (taskStatus === "error") color = "#ef4444";

    return (
      <div
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          backgroundColor: "#ffffff",
          border: `1px solid ${color}`,
          color: "#0f172a",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "999px",
            backgroundColor: color,
          }}
        />
        <span>{taskMessage}</span>
      </div>
    );
  };

  return (
    <div
      className="page-actions"
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {renderTaskBadge()}
      <button
        type="button"
        onClick={onRefresh}
        className="action-button"
        style={{ padding: "6px 14px" }}
      >
        🔄 {t("staging.batch.refresh")}
      </button>
      {onAIScreen && (
        <button
          type="button"
          onClick={onAIScreen}
          disabled={aiScreening}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #8b5cf6",
            backgroundColor: "#f5f3ff",
            color: "#7c3aed",
            fontSize: 13,
            fontWeight: 500,
            cursor: aiScreening ? "default" : "pointer",
            opacity: aiScreening ? 0.6 : 1,
          }}
        >
          {aiScreening
            ? t("staging.batch.aiScreening")
            : `🤖 ${t("staging.batch.aiScreen")}${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
        </button>
      )}
      {onEnrich && (
        <button
          type="button"
          onClick={onEnrich}
          disabled={enriching}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #0ea5e9",
            backgroundColor: "#f0f9ff",
            color: "#0284c7",
            fontSize: 13,
            fontWeight: 500,
            cursor: enriching ? "default" : "pointer",
            opacity: enriching ? 0.6 : 1,
          }}
        >
          {enriching ? t("staging.batch.enriching") : `📥 ${t("staging.batch.enrichInfo")}`}
        </button>
      )}
      <button
        type="button"
        onClick={onDeleteClick}
        disabled={selectedCount === 0}
        style={{
          padding: "6px 14px",
          borderRadius: 6,
          border:
            selectedCount > 0
              ? "1px solid #ef4444"
              : "1px solid #d1d5db",
          backgroundColor: selectedCount > 0 ? "#fef2f2" : "#f9fafb",
          color: selectedCount > 0 ? "#dc2626" : "#9ca3af",
          fontSize: 13,
          fontWeight: 500,
          cursor: selectedCount > 0 ? "pointer" : "default",
        }}
      >
        🗑 {t("staging.batch.delete")} {selectedCount > 0 ? `(${selectedCount})` : ""}
      </button>
      <button
        type="button"
        onClick={onRejectClick}
        disabled={selectedCount === 0}
        style={{
          padding: "6px 14px",
          borderRadius: 6,
          border:
            selectedCount > 0
              ? "1px solid #f97316"
              : "1px solid #d1d5db",
          backgroundColor: selectedCount > 0 ? "#fff7ed" : "#f9fafb",
          color: selectedCount > 0 ? "#ea580c" : "#9ca3af",
          fontSize: 13,
          fontWeight: 500,
          cursor: selectedCount > 0 ? "pointer" : "default",
        }}
      >
        ✕ {t("staging.batch.reject")} {selectedCount > 0 ? `(${selectedCount})` : ""}
      </button>
      <button
        type="button"
        onClick={onPromote}
        disabled={selectedCount === 0 || promoting}
        className={`action-button ${selectedCount > 0 && !promoting ? "primary" : ""}`}
      >
        {promoting
          ? t("staging.batch.promoting")
          : selectedCount === 0
            ? t("staging.batch.selectToOperate")
            : `✓ ${t("staging.batch.promote", { count: selectedCount })}`}
      </button>
    </div>
  );
}
