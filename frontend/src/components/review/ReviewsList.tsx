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
              color: "#1C1C1E",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            文献综述库
          </h1>
          <p style={{ margin: 0, color: "#8E8E93", fontSize: 14 }}>
            查看、导出、校验并管理已生成的综述结果。
          </p>
        </div>
        <div
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            background: "rgba(99,102,241,0.08)",
            color: "#6366f1",
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
            borderRadius: 14,
            textAlign: "center",
            color: "#8E8E93",
            background: "#FFFFFF",
            border: "1px solid #E5E5EA",
          }}
        >
          正在加载综述列表…
        </div>
      ) : error ? (
        <div
          style={{
            padding: 24,
            borderRadius: 14,
            color: "#DC2626",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
          }}
        >
          加载失败：{error}
        </div>
      ) : reviews.length === 0 ? (
        <div
          style={{
            padding: 40,
            borderRadius: 14,
            textAlign: "center",
            color: "#8E8E93",
            background: "#FFFFFF",
            border: "1px solid #E5E5EA",
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
            gap: 16,
          }}
        >
          {reviews.map((review) => (
            <div
              key={review.id}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E5E5EA",
                borderRadius: 16,
                padding: 20,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.2s, transform 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
                e.currentTarget.style.transform = "translateY(0)";
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
                      color: "#1C1C1E",
                      fontSize: 17,
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}
                  >
                    {review.title}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      color: "#8E8E93",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Calendar size={12} />
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <BookOpen size={12} />
                      {review.paper_count} 篇文献
                    </span>
                  </div>
                </div>

                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    background:
                      review.status === "completed"
                        ? "rgba(34,197,94,0.1)"
                        : review.status === "failed"
                          ? "rgba(239,68,68,0.1)"
                          : "rgba(234,179,8,0.1)",
                    color:
                      review.status === "completed"
                        ? "#16a34a"
                        : review.status === "failed"
                          ? "#dc2626"
                          : "#ca8a04",
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {review.status === "completed"
                    ? "已完成"
                    : review.status === "failed"
                      ? "失败"
                      : review.status}
                </span>
              </div>

              {review.abstract && (
                <p
                  style={{
                    margin: "0 0 16px",
                    color: "#3C3C43",
                    fontSize: 13,
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
                  <ExternalLink size={14} />
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
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(34,197,94,0.25)",
                    background: "rgba(34,197,94,0.06)",
                    color: "#16a34a",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <ShieldCheck size={14} />
                  校验
                </button>

                <button
                  onClick={() => onDelete(review.id)}
                  title="删除"
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(239,68,68,0.2)",
                    background: "rgba(239,68,68,0.04)",
                    color: "#dc2626",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <Trash2 size={14} />
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
