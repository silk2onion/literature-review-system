interface BatchActionBarProps {
  selectedCount: number;
  deleting: boolean;
  archiving: boolean;
  restoring: boolean;
  syncing: boolean;
  batchDownloading?: boolean;
  removingFromGroup: boolean;
  selectedGroupId: number | null;
  showArchived: boolean;
  onDelete: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onAddToGroup: () => void;
  onRemoveFromGroup: () => void;
  onSyncCitations: () => void;
  onBatchDownloadPdf?: () => void;
  onGenerateReview?: () => void;
}

export default function BatchActionBar({
  selectedCount,
  deleting,
  archiving,
  restoring,
  syncing,
  batchDownloading,
  removingFromGroup,
  selectedGroupId,
  showArchived,
  onDelete,
  onArchive,
  onRestore,
  onAddToGroup,
  onRemoveFromGroup,
  onSyncCitations,
  onBatchDownloadPdf,
  onGenerateReview,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <>
      <button
        onClick={onAddToGroup}
        className="action-button"
      >
        加入分组
      </button>
      {onBatchDownloadPdf && (
        <button
          onClick={onBatchDownloadPdf}
          disabled={batchDownloading}
          className="action-button"
          style={{
            borderColor: "#8b5cf6",
            backgroundColor: "rgba(139, 92, 246, 0.1)",
            color: "#8b5cf6",
          }}
        >
          {batchDownloading
            ? "下载中..."
            : `批量下载 PDF (${selectedCount})`}
        </button>
      )}
      {selectedGroupId && (
        <button
          onClick={onRemoveFromGroup}
          disabled={removingFromGroup}
          className="action-button warning"
        >
          {removingFromGroup ? "移除中..." : "从分组移除"}
        </button>
      )}
      {selectedGroupId && onGenerateReview && (
        <button
          onClick={onGenerateReview}
          className="action-button accent"
        >
          ✨ 基于此分组生成综述
        </button>
      )}
      <button
        onClick={onSyncCitations}
        disabled={syncing}
        className="action-button"
      >
        {syncing ? "同步中..." : `同步引用 (${selectedCount})`}
      </button>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="action-button danger"
      >
        {deleting ? "删除中..." : `删除选中 (${selectedCount})`}
      </button>

      {!showArchived ? (
        <button
          onClick={onArchive}
          disabled={archiving}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            color: "#f59e0b",
            fontSize: 12,
            cursor: archiving ? "not-allowed" : "pointer",
          }}
        >
          {archiving ? "归档中..." : `归档选中 (${selectedCount})`}
        </button>
      ) : (
        <button
          onClick={onRestore}
          disabled={restoring}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            color: "#10b981",
            fontSize: 12,
            cursor: restoring ? "not-allowed" : "pointer",
          }}
        >
          {restoring ? "恢复中..." : `恢复选中 (${selectedCount})`}
        </button>
      )}
    </>
  );
}
