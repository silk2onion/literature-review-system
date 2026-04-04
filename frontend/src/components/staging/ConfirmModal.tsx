import { useLocale } from "../../hooks/useLocale";

interface ConfirmModalProps {
  show: boolean;
  type: "delete" | "reject" | null;
  count: number;
  exclusionReasonInput: string;
  setExclusionReasonInput: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
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
  const { t } = useLocale();

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
            ? t("staging.confirm.deleteTitle")
            : t("staging.confirm.rejectTitle")}
        </h3>
        <p
          style={{ color: "#4b5563", fontSize: "14px", lineHeight: "1.5" }}
        >
          {type === "delete"
            ? t("staging.confirm.deleteMessage", { count })
            : t("staging.confirm.rejectMessage", { count })}
        </p>
        {type === "reject" && (
          <div style={{ marginTop: 12 }}>
            <label
              style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}
            >
              {t("staging.confirm.exclusionReason")}
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
                <option value="">{t("staging.confirm.selectTemplate")}</option>
                {exclusionTemplates.map((tmpl) => (
                  <option key={tmpl} value={tmpl}>{tmpl}</option>
                ))}
              </select>
            )}
            <textarea
              value={exclusionReasonInput}
              onChange={(e) => setExclusionReasonInput(e.target.value)}
              placeholder={t("staging.confirm.exclusionPlaceholder")}
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
            {t("staging.confirm.cancel")}
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
            {type === "delete"
              ? t("staging.confirm.confirmDelete")
              : t("staging.confirm.confirmReject")}
          </button>
        </div>
      </div>
    </div>
  );
}
