import JournalTooltip, { type JournalInfoLookup } from "./JournalTooltip";
import { API_BASE_URL } from "../../api/config";

export type PaperResponse = {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  publication_date?: string;
  year?: number;
  journal?: string | null;
  journal_issn?: string | null;
  venue?: string | null;
  journal_impact_factor?: number | null;
  journal_quartile?: string | null;
  indexing?: string[] | null;
  doi?: string | null;
  arxiv_id?: string | null;
  pmid?: string | null;
  url?: string | null;
  pdf_url?: string | null;
  source?: string | null;
  categories?: string[] | null;
  keywords?: string[] | null;
  citations_count?: number | null;
  pdf_path?: string | null;
  created_at: string;
  updated_at: string;
};

interface PapersTableProps {
  items: PaperResponse[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  selectedPaperId: number | null;
  onSelectPaper: (id: number, title: string) => void;
  downloadingIds: Set<number>;
  enrichingIds: Set<number>;
  onDownloadPdf: (paperId: number) => void;
  onEnrichJournal: (paper: PaperResponse) => void;
  hoveredJournal: string | null;
  journalTooltipData: JournalInfoLookup | null;
  journalTooltipLoading: boolean;
  onJournalMouseEnter: (journalName: string) => void;
  onJournalMouseLeave: () => void;
  onLogInteraction: (paperId: number, action: string) => void;
  loading: boolean;
  ezproxyPrefix?: string;
}

export default function PapersTable({
  items,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onSelectPaper,
  downloadingIds,
  enrichingIds,
  onDownloadPdf,
  onEnrichJournal,
  hoveredJournal,
  journalTooltipData,
  journalTooltipLoading,
  onJournalMouseEnter,
  onJournalMouseLeave,
  onLogInteraction,
  loading,
  ezproxyPrefix,
}: PapersTableProps) {
  const canEnrichJournalInfo = (paper: PaperResponse) =>
    Boolean(paper.journal || paper.journal_issn);

  const needsJournalEnrichment = (paper: PaperResponse) =>
    !(
      paper.journal_impact_factor != null &&
      Boolean(paper.journal_quartile) &&
      Boolean(paper.indexing && paper.indexing.length > 0)
    );

  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 40, textAlign: "center" }}>
              <input
                type="checkbox"
                checked={
                  items.length > 0 && selectedIds.size === items.length
                }
                onChange={onSelectAll}
                style={{ cursor: "pointer" }}
              />
            </th>
            <th>标题</th>
            <th style={{ width: 160 }}>作者</th>
            <th style={{ width: 80 }}>年份</th>
            <th style={{ width: 120 }}>来源</th>
            <th style={{ width: 100 }}>期刊信息</th>
            <th style={{ width: 120 }}>链接</th>
            <th style={{ width: 100 }}>引用图</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && !loading && (
            <tr>
              <td
                colSpan={8}
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  color: "#6b7280",
                }}
              >
                当前条件下没有检索到文献，可以尝试放宽关键词或年份范围。
              </td>
            </tr>
          )}
          {items.map((p) => (
            <tr key={p.id}>
              <td style={{ textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => onToggleSelect(p.id)}
                  style={{ cursor: "pointer" }}
                />
              </td>
              <td>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <a
                    href={p.pdf_url || p.url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onLogInteraction(p.id, "click_title")}
                    style={{
                      color: p.pdf_url || p.url ? "#38bdf8" : "#e5e7eb",
                      textDecoration:
                        p.pdf_url || p.url ? "underline" : "none",
                      cursor: p.pdf_url || p.url ? "pointer" : "default",
                    }}
                  >
                    {p.title}
                  </a>
                  {p.abstract && (
                    <span
                      className="paper-abstract"
                      style={{ fontSize: 12 }}
                    >
                      {p.abstract}
                    </span>
                  )}
                </div>
              </td>
              <td>
                {p.authors && p.authors.length > 0
                  ? p.authors.slice(0, 3).join(", ") +
                    (p.authors.length > 3 ? " ..." : "")
                  : "-"}
              </td>
              <td>{p.year ?? "-"}</td>
              <td>{p.source || "-"}</td>
              <td>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {p.journal && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        lineHeight: 1.3,
                        position: "relative",
                        cursor: "help",
                        borderBottom: "1px dotted #64748b",
                      }}
                      onMouseEnter={() =>
                        onJournalMouseEnter(p.journal!)
                      }
                      onMouseLeave={onJournalMouseLeave}
                    >
                      {p.journal}
                      {hoveredJournal === p.journal && (
                        <JournalTooltip
                          data={journalTooltipData}
                          loading={journalTooltipLoading}
                          journalName={p.journal}
                        />
                      )}
                    </span>
                  )}
                  {p.journal_quartile && (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 6px",
                        borderRadius: 4,
                        backgroundColor:
                          p.journal_quartile === "Q1"
                            ? "rgba(34, 197, 94, 0.2)"
                            : p.journal_quartile === "Q2"
                              ? "rgba(56, 189, 248, 0.2)"
                              : "rgba(148, 163, 184, 0.2)",
                        color:
                          p.journal_quartile === "Q1"
                            ? "#4ade80"
                            : p.journal_quartile === "Q2"
                              ? "#38bdf8"
                              : "#94a3b8",
                        fontSize: 11,
                        fontWeight: 600,
                        width: "fit-content",
                      }}
                    >
                      {p.journal_quartile}
                    </span>
                  )}
                  {p.journal_impact_factor != null && (
                    <span style={{ fontSize: 11, color: "#cbd5e1" }}>
                      IF: {p.journal_impact_factor.toFixed(1)}
                    </span>
                  )}
                  {p.indexing && p.indexing.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 2,
                        marginTop: 2,
                      }}
                    >
                      {p.indexing.map((idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 10,
                            padding: "1px 4px",
                            borderRadius: 3,
                            backgroundColor: "rgba(139, 92, 246, 0.15)",
                            color: "#a78bfa",
                            border: "1px solid rgba(139, 92, 246, 0.3)",
                          }}
                        >
                          {idx}
                        </span>
                      ))}
                    </div>
                  )}
                  {canEnrichJournalInfo(p) && needsJournalEnrichment(p) && (
                    <button
                      type="button"
                      onClick={() => onEnrichJournal(p)}
                      disabled={enrichingIds.has(p.id)}
                      style={{
                        marginTop: 4,
                        width: "fit-content",
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid #38bdf8",
                        backgroundColor: "rgba(56, 189, 248, 0.1)",
                        color: "#38bdf8",
                        fontSize: 10,
                        cursor: enrichingIds.has(p.id)
                          ? "not-allowed"
                          : "pointer",
                        opacity: enrichingIds.has(p.id) ? 0.7 : 1,
                      }}
                    >
                      {enrichingIds.has(p.id)
                        ? "增强中..."
                        : "补全期刊信息"}
                    </button>
                  )}
                  {!p.journal_quartile &&
                    p.journal_impact_factor == null &&
                    (!p.indexing || p.indexing.length === 0) &&
                    !canEnrichJournalInfo(p) &&
                    "-"}
                </div>
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#9ca3af",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {p.doi ? (
                    <a
                      href={`https://doi.org/${p.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#38bdf8" }}
                    >
                      DOI
                    </a>
                  ) : p.source === "arxiv" && p.arxiv_id ? (
                    <a
                      href={`https://arxiv.org/abs/${p.arxiv_id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#38bdf8" }}
                    >
                      arXiv
                    </a>
                  ) : p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#38bdf8" }}
                    >
                      链接
                    </a>
                  ) : (
                    "-"
                  )}

                  {p.pdf_path ? (
                    <a
                      href={`${API_BASE_URL}/api/papers/${p.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => onLogInteraction(p.id, "view_local_pdf")}
                      style={{
                        fontSize: 11,
                        color: "#4ade80",
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <span>📄 查看 PDF</span>
                    </a>
                  ) : p.pdf_url ? (
                    <button
                      onClick={() => {
                        onDownloadPdf(p.id);
                        onLogInteraction(p.id, "download_pdf");
                      }}
                      disabled={downloadingIds.has(p.id)}
                      style={{
                        background: "transparent",
                        border: "1px solid #334155",
                        borderRadius: 4,
                        color: downloadingIds.has(p.id)
                          ? "#9ca3af"
                          : "#94a3b8",
                        fontSize: 10,
                        padding: "2px 6px",
                        cursor: downloadingIds.has(p.id)
                          ? "not-allowed"
                          : "pointer",
                        width: "fit-content",
                      }}
                    >
                      {downloadingIds.has(p.id)
                        ? "下载中..."
                        : "⬇️ 下载 PDF"}
                    </button>
                  ) : p.doi && ezproxyPrefix ? (
                    <button
                      onClick={async () => {
                        onLogInteraction(p.id, "institutional_pdf");
                        try {
                          const r = await fetch(
                            `${API_BASE_URL}/api/papers/institutional-url?doi=${encodeURIComponent(p.doi!)}`,
                          );
                          if (r.ok) {
                            const d = await r.json();
                            window.open(d.proxied_url, "_blank");
                          } else {
                            // fallback: 直接用 EZProxy + doi.org
                            window.open(`${ezproxyPrefix}https://doi.org/${p.doi}`, "_blank");
                          }
                        } catch {
                          window.open(`${ezproxyPrefix}https://doi.org/${p.doi}`, "_blank");
                        }
                      }}
                      style={{
                        background: "transparent",
                        fontSize: 10,
                        color: "#8b5cf6",
                        border: "1px solid #8b5cf680",
                        borderRadius: 4,
                        padding: "2px 6px",
                        cursor: "pointer",
                      }}
                    >
                      🏛️ 机构下载
                    </button>
                  ) : null}
                </div>
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#9ca3af",
                }}
              >
                <button
                  type="button"
                  className="link-button small"
                  onClick={() => {
                    onSelectPaper(p.id, p.title);
                    onLogInteraction(p.id, "view_citations");
                  }}
                >
                  查看引用
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
