export type JournalInfoLookup = {
  name: string | null;
  issn: string | null;
  impact_factor: number | null;
  quartile: string | null;
  indexing: string[] | null;
  source: "local_library" | "not_found";
};

interface JournalTooltipProps {
  data: JournalInfoLookup | null;
  loading: boolean;
  journalName: string;
}

export default function JournalTooltip({
  data,
  loading,
  journalName,
}: JournalTooltipProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        zIndex: 1000,
        minWidth: 220,
        maxWidth: 300,
        padding: "10px 12px",
        borderRadius: 8,
        backgroundColor: "#1e293b",
        color: "#e2e8f0",
        fontSize: 11,
        lineHeight: 1.5,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        border: "1px solid #334155",
        pointerEvents: "none",
      }}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      {loading && <span style={{ color: "#94a3b8" }}>查询中...</span>}
      {!loading && data && data.source === "not_found" && (
        <span style={{ color: "#94a3b8" }}>未找到期刊信息</span>
      )}
      {!loading && data && data.source !== "not_found" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: "#f1f5f9",
              marginBottom: 2,
            }}
          >
            {data.name || journalName}
          </div>
          {data.issn && (
            <div>
              <span style={{ color: "#64748b" }}>ISSN:</span> {data.issn}
            </div>
          )}
          {data.impact_factor != null && (
            <div>
              <span style={{ color: "#64748b" }}>Impact Factor:</span>{" "}
              <span
                style={{
                  color: "#fbbf24",
                  fontWeight: 600,
                }}
              >
                {data.impact_factor.toFixed(3)}
              </span>
            </div>
          )}
          {data.quartile && (
            <div>
              <span style={{ color: "#64748b" }}>Quartile:</span>{" "}
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontWeight: 600,
                  backgroundColor:
                    data.quartile === "Q1"
                      ? "rgba(34,197,94,0.2)"
                      : data.quartile === "Q2"
                        ? "rgba(56,189,248,0.2)"
                        : "rgba(148,163,184,0.2)",
                  color:
                    data.quartile === "Q1"
                      ? "#4ade80"
                      : data.quartile === "Q2"
                        ? "#38bdf8"
                        : "#94a3b8",
                }}
              >
                {data.quartile}
              </span>
            </div>
          )}
          {data.indexing && data.indexing.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 3,
                marginTop: 2,
              }}
            >
              {data.indexing.map((idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 3,
                    backgroundColor: "rgba(139,92,246,0.2)",
                    color: "#a78bfa",
                  }}
                >
                  {idx}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
