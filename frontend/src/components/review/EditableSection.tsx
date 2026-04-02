import { Edit2, Save, XCircle } from "lucide-react";

export interface EditableSectionProps {
  content: string;
  editing: boolean;
  editText: string;
  saving: boolean;
  onStartEditing: () => void;
  onCancel: () => void;
  onSave: () => void;
  onTextChange: (text: string) => void;
  label: string;
  /** Optional accent color for the edit button border / textarea border */
  accentColor?: string;
  /** Optional accent text color for the edit button */
  accentTextColor?: string;
  /** Optional section background */
  sectionBackground?: string;
  /** Optional section border */
  sectionBorder?: string;
  /** Placeholder when no content */
  placeholder?: string;
}

export default function EditableSection({
  content,
  editing,
  editText,
  saving,
  onStartEditing,
  onCancel,
  onSave,
  onTextChange,
  label,
  accentColor = "rgba(168,85,247,0.25)",
  accentTextColor = "#c4b5fd",
  sectionBackground = "rgba(255,255,255,0.03)",
  sectionBorder = "1px solid rgba(148,163,184,0.12)",
  placeholder,
}: EditableSectionProps) {
  return (
    <section
      style={{
        padding: 18,
        borderRadius: 14,
        background: sectionBackground,
        border: sectionBorder,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, color: "#f8fafc", fontSize: 18 }}>{label}</h3>
        {!editing ? (
          <button
            onClick={onStartEditing}
            style={{
              background: "none",
              border: `1px solid ${accentColor}`,
              borderRadius: 8,
              color: accentTextColor,
              cursor: "pointer",
              padding: "4px 10px",
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Edit2 size={12} />
            编辑
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                background: "rgba(34,197,94,0.15)",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 8,
                color: "#86efac",
                cursor: "pointer",
                padding: "4px 10px",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Save size={12} />
              {saving ? "\u4fdd\u5b58\u4e2d\u2026" : "\u4fdd\u5b58"}
            </button>
            <button
              onClick={onCancel}
              style={{
                background: "none",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 8,
                color: "#94a3b8",
                cursor: "pointer",
                padding: "4px 10px",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <XCircle size={12} />
              取消
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={editText}
          onChange={(e) => onTextChange(e.target.value)}
          style={{
            width: "100%",
            minHeight: 160,
            background: "rgba(0,0,0,0.25)",
            border: `1px solid ${accentColor.replace("0.25", "0.3")}`,
            borderRadius: 10,
            color: "#e2e8f0",
            padding: 14,
            fontSize: 14,
            lineHeight: 1.7,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      ) : content ? (
        <p
          style={{
            margin: 0,
            color: "#cbd5e1",
            lineHeight: 1.8,
            fontSize: 15,
          }}
        >
          {content}
        </p>
      ) : (
        <p style={{ margin: 0, color: "#64748b", fontStyle: "italic" }}>
          {placeholder || `\u5c1a\u672a\u6dfb\u52a0${label}\u3002`}
        </p>
      )}
    </section>
  );
}
