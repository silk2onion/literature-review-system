import { Download, FileDown } from "lucide-react";

export interface ExportDropdownProps {
  reviewId: number;
  open: boolean;
  onToggle: () => void;
  exporting: boolean;
  onExportMarkdown: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
}

export default function ExportDropdown({
  open,
  onToggle,
  exporting,
  onExportMarkdown,
  onExportDocx,
  onExportPdf,
}: ExportDropdownProps) {
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title="导出"
        disabled={exporting}
        style={{
          padding: "7px 14px",
          borderRadius: 8,
          border: "1px solid #D1D1D6",
          background: "#FFFFFF",
          color: "#1C1C1E",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "#F5F5F7")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "#FFFFFF")
        }
      >
        <Download size={14} />
        导出
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "#FFFFFF",
            borderRadius: 10,
            border: "1px solid #E5E5EA",
            padding: 4,
            zIndex: 30,
            minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {[
            { label: "Markdown (.md)", icon: Download, handler: onExportMarkdown },
            { label: "Word (.docx)", icon: FileDown, handler: onExportDocx },
            { label: "PDF (.pdf)", icon: FileDown, handler: onExportPdf },
          ].map(({ label, icon: Icon, handler }) => (
            <button
              key={label}
              onClick={handler}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                background: "none",
                border: "none",
                color: "#1C1C1E",
                cursor: "pointer",
                borderRadius: 6,
                fontSize: 13,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#F5F5F7")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <Icon size={14} style={{ color: "#8E8E93" }} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
