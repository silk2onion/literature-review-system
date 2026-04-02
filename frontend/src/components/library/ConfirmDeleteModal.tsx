interface ConfirmDeleteModalProps {
  open: boolean;
  count: number;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmDeleteModal({
  open,
  count,
  deleting,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 9999,
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: 400,
          backgroundColor: "white",
          padding: "24px",
          borderRadius: "12px",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
        }}
      >
        <h3 style={{ color: "#ef4444", marginTop: 0 }}>⚠️ 确认永久删除</h3>
        <p
          style={{
            margin: "16px 0",
            color: "#4b5563",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          确定要删除选中的 <strong>{count}</strong> 篇文献吗？
          <br />
          <span style={{ fontSize: "0.9em", color: "#ef4444" }}>
            ※ 此操作将从数据库和向量库中永久移除，不可恢复。
          </span>
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 24,
          }}
        >
          <button
            className="action-button"
            onClick={onClose}
            disabled={deleting}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            className="action-button danger"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: "#ef4444",
              color: "white",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {deleting ? "正在执行..." : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
