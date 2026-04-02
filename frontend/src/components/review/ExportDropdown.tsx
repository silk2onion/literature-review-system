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
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(148,163,184,0.15)",
          background: "rgba(255,255,255,0.04)",
          color: "#e2e8f0",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Download size={15} />
        导出
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "#1e293b",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.15)",
            padding: 6,
            zIndex: 30,
            minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <button
            onClick={onExportMarkdown}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "9px 12px",
              background: "none",
              border: "none",
              color: "#e2e8f0",
              cursor: "pointer",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <Download size={14} />
            Markdown (.md)
          </button>
          <button
            onClick={onExportDocx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "9px 12px",
              background: "none",
              border: "none",
              color: "#e2e8f0",
              cursor: "pointer",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <FileDown size={14} />
            Word (.docx)
          </button>
          <button
            onClick={onExportPdf}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "9px 12px",
              background: "none",
              border: "none",
              color: "#e2e8f0",
              cursor: "pointer",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <FileDown size={14} />
            PDF (.pdf)
          </button>
        </div>
      )}
    </div>
  );
}
