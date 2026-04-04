import { useLocale } from "../../hooks/useLocale";

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
  onEnrich?: () => void;
  enriching?: boolean;
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
  onEnrich,
  enriching,
}: BatchActionBarProps) {
  const { t } = useLocale();

  if (selectedCount === 0) return null;

  return (
    <>
      <button
        onClick={onAddToGroup}
        className="action-button"
      >
        {t("batch.addToGroup")}
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
            ? t("batch.downloadingPdf")
            : t("batch.batchDownloadPdf", { count: selectedCount })}
        </button>
      )}
      {selectedGroupId && (
        <button
          onClick={onRemoveFromGroup}
          disabled={removingFromGroup}
          className="action-button warning"
        >
          {removingFromGroup ? t("batch.removingFromGroup") : t("batch.removeFromGroup")}
        </button>
      )}
      {selectedGroupId && onGenerateReview && (
        <button
          onClick={onGenerateReview}
          className="action-button accent"
        >
          ✨ {t("batch.generateReviewFromGroup")}
        </button>
      )}
      <button
        onClick={onSyncCitations}
        disabled={syncing}
        className="action-button"
      >
        {syncing ? t("batch.syncing") : t("batch.syncCitations", { count: selectedCount })}
      </button>
      {onEnrich && (
        <button
          onClick={onEnrich}
          disabled={enriching}
          className="action-button"
          style={{
            borderColor: "#0ea5e9",
            backgroundColor: "rgba(14, 165, 233, 0.1)",
            color: "#0284c7",
          }}
        >
          {enriching ? "补齐中..." : `📥 补齐信息 (${selectedCount})`}
        </button>
      )}
      <button
        onClick={onDelete}
        disabled={deleting}
        className="action-button danger"
      >
        {deleting ? t("batch.deleting") : t("batch.deleteSelected", { count: selectedCount })}
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
          {archiving ? t("batch.archiving") : t("batch.archiveSelected", { count: selectedCount })}
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
          {restoring ? t("batch.restoring") : t("batch.restoreSelected", { count: selectedCount })}
        </button>
      )}
    </>
  );
}
