import {
  FileText,
  Trash2,
  ExternalLink,
  Calendar,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import type { Review } from "../../types/review";
import ExportDropdown from "./ExportDropdown";

export interface ReviewsListProps {
  reviews: Review[];
  selectedId: number | null;
  onSelect: (review: Review) => void;
  onDelete: (id: number) => void;
  loading: boolean;
  error: string | null;
  /* Export-related */
  exporting: number | null;
  exportDropdown: number | null;
  onExportDropdownToggle: (reviewId: number) => void;
  onExportMarkdown: (review: Review) => void;
  onExportDocx: (review: Review) => void;
  onExportPdf: (review: Review) => void;
  /* Validate */
  validating: boolean;
  onValidate: (reviewId: number) => void;
}

export default function ReviewsList({
  reviews,
  onSelect,
  onDelete,
  loading,
  error,
  exporting,
  exportDropdown,
  onExportDropdownToggle,
  onExportMarkdown,
  onExportDocx,
  onExportPdf,
  validating,
  onValidate,
}: ReviewsListProps) {
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "24px 20px 48px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 8px",
              color: "#f8fafc",
              fontSize: 30,
            }}
          >
            文献综述库
          </h1>
          <p style={{ margin: 0, color: "#94a3b8" }}>
            查看、导出、校验并管理已生成的综述结果。
          </p>
        </div>
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            background: "rgba(99,102,241,0.12)",
            color: "#c4b5fd",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          共 {reviews.length} 份综述
        </div>
      </div>

      {loading ? (
        <div
          style={{
            padding: 40,
            borderRadius: 16,
            textAlign: "center",
            color: "#94a3b8",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(148,163,184,0.12)",
          }}
        >
          正在加载综述列表…
        </div>
      ) : error ? (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            color: "#fecaca",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.16)",
          }}
        >
          加载失败：{error}
        </div>
      ) : reviews.length === 0 ? (
        <div
          style={{
            padding: 40,
            borderRadius: 16,
            textAlign: "center",
            color: "#94a3b8",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(148,163,184,0.12)",
          }}
        >
          <FileText size={28} style={{ marginBottom: 12 }} />
          <div>暂时还没有生成好的综述。</div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 18,
          }}
        >
          {reviews.map((review) => (
            <div
              key={review.id}
              style={{
                background: "rgba(15,23,42,0.78)",
                border: "1px solid rgba(148,163,184,0.14)",
                borderRadius: 18,
                padding: 20,
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      margin: "0 0 8px",
                      color: "#f8fafc",
                      fontSize: 20,
                      lineHeight: 1.35,
                    }}
                  >
                    {review.title}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      color: "#94a3b8",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Calendar size={13} />
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <BookOpen size={13} />
                      {review.paper_count} 篇文献
                    </span>
                  </div>
                </div>

                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(34,197,94,0.12)",
                    color: "#86efac",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  {review.status}
                </span>
              </div>

              {review.abstract && (
                <p
                  style={{
                    margin: "0 0 16px",
                    color: "#cbd5e1",
                    fontSize: 14,
                    lineHeight: 1.7,
                  }}
                >
                  {review.abstract.length > 180
                    ? `${review.abstract.slice(0, 180)}...`
                    : review.abstract}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  position: "relative",
                }}
              >
                <button
                  onClick={() => onSelect(review)}
                  title="查看详情"
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
                  <ExternalLink size={15} />
                  详情
                </button>

                <ExportDropdown
                  reviewId={review.id}
                  open={exportDropdown === review.id}
                  onToggle={() => onExportDropdownToggle(review.id)}
                  exporting={exporting === review.id}
                  onExportMarkdown={() => {
                    onExportMarkdown(review);
                  }}
                  onExportDocx={() => {
                    onExportDocx(review);
                  }}
                  onExportPdf={() => {
                    onExportPdf(review);
                  }}
                />

                <button
                  onClick={() => onValidate(review.id)}
                  disabled={validating}
                  title="校验引用"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(34,197,94,0.22)",
                    background: "rgba(34,197,94,0.12)",
                    color: "#bbf7d0",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <ShieldCheck size={15} />
                  校验
                </button>

                <button
                  onClick={() => onDelete(review.id)}
                  title="删除"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(239,68,68,0.18)",
                    background: "rgba(239,68,68,0.08)",
                    color: "#fca5a5",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
