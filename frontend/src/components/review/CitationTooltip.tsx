import { useState } from "react";
import type { PaperInfo } from "../../types/paper";

export const CITATION_REGEX =
  /\(([A-Z][a-zA-Zà-ÿ\-']+(?:\s+(?:et\s+al\.|&\s+[A-Z][a-zA-Zà-ÿ\-']+))?(?:,?\s*\d{4})(?:,\s*p\.\d+)?)\)/g;

export default function CitationTooltip({
  citationText,
  paperInfo,
}: {
  citationText: string;
  paperInfo?: PaperInfo;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pageMatch = citationText.match(/p\.(\d+)/);
  const pageNumber = pageMatch ? parseInt(pageMatch[1]) : null;

  return (
    <span
      style={{ position: "relative", display: "inline" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        style={{
          color: paperInfo ? "#a78bfa" : "#94a3b8",
          cursor: paperInfo ? "pointer" : "default",
          borderBottom: paperInfo ? "1px dotted rgba(167,139,250,0.4)" : "none",
          transition: "color 0.2s",
        }}
      >
        ({citationText})
      </span>
      {showTooltip && paperInfo && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1e293b",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 10,
            padding: "12px 16px",
            minWidth: 300,
            maxWidth: 420,
            zIndex: 100,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 12,
              height: 12,
              background: "#1e293b",
              border: "1px solid rgba(148,163,184,0.2)",
              borderTop: "none",
              borderLeft: "none",
            }}
          />
          <p
            style={{
              margin: "0 0 6px",
              color: "#f1f5f9",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {paperInfo.title}
          </p>
          <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: 11 }}>
            {paperInfo.authors || "Unknown authors"}
            {paperInfo.year ? ` (${paperInfo.year})` : ""}
          </p>
          {paperInfo.journal && (
            <p
              style={{
                margin: "0 0 4px",
                color: "#64748b",
                fontSize: 11,
                fontStyle: "italic",
              }}
            >
              {paperInfo.journal}
            </p>
          )}
          {pageNumber && (
            <span
              style={{
                display: "inline-block",
                marginTop: 4,
                padding: "2px 8px",
                borderRadius: 4,
                background: "rgba(59,130,246,0.15)",
                color: "#93c5fd",
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              📄 Page {pageNumber}
            </span>
          )}
          {paperInfo.doi && (
            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 10 }}>
              DOI: {paperInfo.doi}
            </p>
          )}
          <span
            style={{
              display: "inline-block",
              marginTop: 4,
              marginLeft: pageNumber ? 6 : 0,
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(139,92,246,0.12)",
              color: "#a78bfa",
              fontSize: 9,
            }}
          >
            ID: {paperInfo.id}
          </span>
        </div>
      )}
    </span>
  );
}
