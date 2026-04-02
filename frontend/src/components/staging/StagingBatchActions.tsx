interface StagingBatchActionsProps {
  selectedCount: number;
  promoting: boolean;
  taskStatus: "idle" | "running" | "done" | "error";
  taskMessage: string;
  onRefresh: () => void;
  onDeleteClick: () => void;
  onRejectClick: () => void;
  onPromote: () => void;
}

export default function StagingBatchActions({
  selectedCount,
  promoting,
  taskStatus,
  taskMessage,
  onRefresh,
  onDeleteClick,
  onRejectClick,
  onPromote,
}: StagingBatchActionsProps) {
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
        🔄 刷新
      </button>
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
        🗑 删除 {selectedCount > 0 ? `(${selectedCount})` : ""}
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
        ✕ 拒绝 {selectedCount > 0 ? `(${selectedCount})` : ""}
      </button>
      <button
        type="button"
        onClick={onPromote}
        disabled={selectedCount === 0 || promoting}
        className={`action-button ${selectedCount > 0 && !promoting ? "primary" : ""}`}
      >
        {promoting
          ? "正在提升..."
          : selectedCount === 0
            ? "选择后可操作"
            : `✓ 提升 (${selectedCount})`}
      </button>
    </div>
  );
}
