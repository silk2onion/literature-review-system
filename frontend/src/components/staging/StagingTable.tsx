import type { StagingPaper } from "./types";
import { SCREENING_STAGE_OPTIONS } from "./types";
import { useLocale } from "../../hooks/useLocale";

interface StagingTableProps {
  items: StagingPaper[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  selectedIds: number[];
  allCurrentSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageSizeChange: (newSize: number) => void;
}

export default function StagingTable({
  items,
  loading,
  total,
  page,
  pageSize,
  totalPages,
  selectedIds,
  allCurrentSelected,
  onToggleSelectAll,
  onToggleSelectOne,
  onPrevPage,
  onNextPage,
  onPageSizeChange,
}: StagingTableProps) {
  const { t } = useLocale();

  return (
    <section className="data-table-container">
      <div className="table-header-info">
        <span>{t("staging.totalCount", { total })}</span>
        <span>
          {t("staging.table.pageInfo", { page, totalPages })}
        </span>
      </div>

      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: "left" }}>
                <input
                  type="checkbox"
                  checked={allCurrentSelected}
                  onChange={onToggleSelectAll}
                />
              </th>
              <th>{t("staging.table.title")}</th>
              <th style={{ width: 120 }}>{t("staging.table.source")}</th>
              <th style={{ width: 80 }}>{t("staging.table.year")}</th>
              <th style={{ width: 100 }}>{t("staging.table.status")}</th>
              <th style={{ width: 80 }}>{t("staging.table.aiScore")}</th>
              <th style={{ width: 110 }}>{t("staging.table.screeningStage")}</th>
              <th style={{ width: 140 }}>{t("staging.table.links")}</th>
              <th style={{ width: 100 }}>{t("staging.table.crawlJob")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    padding: "16px 12px",
                    textAlign: "center",
                    color: "#6b7280",
                  }}
                >
                  {t("staging.table.emptyResult")}
                </td>
              </tr>
            )}
            {items.map((p) => {
              const checked = selectedIds.includes(p.id);
              return (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    backgroundColor: checked ? "#eff6ff" : "transparent",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 12px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSelectOne(p.id)}
                    />
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      maxWidth: 520,
                    }}
                  >
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
                        style={{
                          color: p.pdf_url || p.url ? "#0284c7" : "#94a3b8",
                          textDecoration:
                            p.pdf_url || p.url ? "underline" : "none",
                          cursor: p.pdf_url || p.url ? "pointer" : "default",
                        }}
                      >
                        {p.title}
                      </a>
                      {p.abstract && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {p.abstract}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#4b5563",
                    }}
                  >
                    {p.source || "-"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#1f2937",
                    }}
                  >
                    {p.year ?? "-"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color:
                        p.status === "accepted"
                          ? "#4ade80"
                          : p.status === "rejected"
                            ? "#f97316"
                            : "#64748b",
                    }}
                  >
                    {p.status || "-"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    {p.llm_score != null ? (
                      <span
                        title={Array.isArray(p.llm_tags) ? p.llm_tags.join(" | ") : ""}
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor:
                            p.llm_score >= 7
                              ? "#dcfce7"
                              : p.llm_score >= 4
                                ? "#fef9c3"
                                : "#fee2e2",
                          color:
                            p.llm_score >= 7
                              ? "#16a34a"
                              : p.llm_score >= 4
                                ? "#ca8a04"
                                : "#dc2626",
                          cursor: "default",
                        }}
                      >
                        {p.llm_score}/10
                      </span>
                    ) : (
                      <span style={{ color: "#d1d5db" }}>-</span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                    }}
                  >
                    {(() => {
                      const stageOpt = SCREENING_STAGE_OPTIONS.find(
                        (o) => o.value === p.screening_stage,
                      );
                      if (!stageOpt || p.screening_stage === "all")
                        return <span style={{ color: "#9ca3af" }}>-</span>;
                      return (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 500,
                            backgroundColor: `${stageOpt.color}18`,
                            color: stageOpt.color,
                            border: `1px solid ${stageOpt.color}40`,
                          }}
                        >
                          {t(stageOpt.labelKey)}
                        </span>
                      );
                    })()}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    {p.doi ? (
                      <a
                        href={`https://doi.org/${p.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#0284c7" }}
                      >
                        DOI
                      </a>
                    ) : p.source === "arxiv" && p.arxiv_id ? (
                      <a
                        href={`https://arxiv.org/abs/${p.arxiv_id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#0284c7" }}
                      >
                        arXiv
                      </a>
                    ) : p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#0284c7" }}
                      >
                        {t("staging.table.links")}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    {p.crawl_job_id ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#9ca3af" }}>
            {t("staging.table.showing", {
              from: (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, total),
            })}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#6b7280" }}>{t("staging.table.perPage")}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value) || 20;
                onPageSizeChange(newSize);
              }}
              style={{
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#0f172a",
                fontSize: 12,
              }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onPrevPage}
            disabled={loading || page <= 1}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontSize: 12,
              cursor: loading || page <= 1 ? "default" : "pointer",
              opacity: loading || page <= 1 ? 0.5 : 1,
            }}
          >
            {t("staging.table.prevPage")}
          </button>
          <button
            onClick={onNextPage}
            disabled={loading || page >= totalPages}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontSize: 12,
              cursor: loading || page >= totalPages ? "default" : "pointer",
              opacity: loading || page >= totalPages ? 0.5 : 1,
            }}
          >
            {t("staging.table.nextPage")}
          </button>
        </div>
      </div>
    </section>
  );
}
