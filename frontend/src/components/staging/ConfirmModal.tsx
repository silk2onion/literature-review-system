interface ConfirmModalProps {
  show: boolean;
  type: "delete" | "reject" | null;
  count: number;
  exclusionReasonInput: string;
  setExclusionReasonInput: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** 可选：预定义排除原因模板列表 */
  exclusionTemplates?: string[];
}

export default function ConfirmModal({
  show,
  type,
  count,
  exclusionReasonInput,
  setExclusionReasonInput,
  onCancel,
  onConfirm,
  exclusionTemplates,
}: ConfirmModalProps) {
  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "24px",
          borderRadius: "12px",
          maxWidth: "400px",
          width: "90%",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            color:
              type === "delete" ? "#ef4444" : "#f97316",
          }}
        >
          {type === "delete"
            ? "⚠️ 确认永久删除"
            : "确认标记拒绝"}
        </h3>
        <p
          style={{ color: "#4b5563", fontSize: "14px", lineHeight: "1.5" }}
        >
          {type === "delete"
            ? `确定要永久删除选中的 ${count} 条暂存文献吗？此操作不可恢复！`
            : `确定要将当前选中的 ${count} 条暂存文献标记为"已拒绝"吗？`}
        </p>
        {type === "reject" && (
          <div style={{ marginTop: 12 }}>
            <label
              style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}
            >
              排除原因:
            </label>
            {exclusionTemplates && exclusionTemplates.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) setExclusionReasonInput(e.target.value);
                }}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                <option value="">-- 选择预定义原因 --</option>
                {exclusionTemplates.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            <textarea
              value={exclusionReasonInput}
              onChange={(e) => setExclusionReasonInput(e.target.value)}
              placeholder="选择上方模板或自行填写排除原因..."
              style={{
                width: "100%",
                marginTop: 6,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
                minHeight: 60,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            marginTop: "24px",
          }}
        >
          <button
            onClick={onCancel}
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
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor:
                type === "delete" ? "#ef4444" : "#f97316",
              color: "white",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            确认{type === "delete" ? "删除" : "拒绝"}
          </button>
        </div>
      </div>
    </div>
  );
}
