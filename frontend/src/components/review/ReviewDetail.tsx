import { useMemo } from "react";
import {
  FileText,
  Download,
  Calendar,
  BookOpen,
  ArrowLeft,
  FileDown,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Review, EditingSection } from "../../types/review";
import type { PaperInfo } from "../../types/paper";
import { CITATION_REGEX } from "./CitationTooltip";
import TextWithCitations from "./TextWithCitations";
import EditableSection from "./EditableSection";

/**
 * Extract body content (strip Title / Abstract / Conclusion / References)
 */
function extractBody(content: string): string {
  if (!content) return "";
  let body = content;
  body = body.replace(/^#\s+[^\n]+\n*/m, "");
  body = body.replace(/## Abstract\s*\n[\s\S]*?(?=\n## (?!Abstract)|$)/i, "");
  body = body.replace(
    /## Conclusion\s*\n[\s\S]*?(?=\n## (?!Conclusion)|$)/i,
    "",
  );
  body = body.replace(/## References\s*\n[\s\S]*$/i, "");
  return body.trim();
}

export interface ReviewDetailProps {
  review: Review;
  paperMap: Record<number, PaperInfo>;
  citationMap: Record<string, number>;
  editingSection: EditingSection;
  editText: string;
  saving: boolean;
  onStartEditing: (section: "abstract" | "conclusion", text: string) => void;
  onCancelEditing: () => void;
  onSaveSection: (section: "abstract" | "conclusion", text: string) => void;
  onSetEditText: (text: string) => void;
  onBack: () => void;
  /* actions */
  validating: boolean;
  onValidate: (reviewId: number) => void;
  onClaimsEvidence: (reviewId: number) => void;
  generating: string | null;
  onGenerateAbstract: (reviewId: number) => void;
  onGenerateConclusion: (reviewId: number) => void;
  exporting: number | null;
  onExportMarkdown: (review: Review) => void;
  onExportDocx: (review: Review) => void;
  onExportPdf: (review: Review) => void;
}

export default function ReviewDetail({
  review,
  paperMap,
  citationMap,
  editingSection,
  editText,
  saving,
  onStartEditing,
  onCancelEditing,
  onSaveSection,
  onSetEditText,
  onBack,
  validating,
  onValidate,
  onClaimsEvidence,
  generating,
  onGenerateAbstract,
  onGenerateConclusion,
  exporting,
  onExportMarkdown,
  onExportDocx,
  onExportPdf,
}: ReviewDetailProps) {
  const fullContent =
    review.content ||
    review.analysis_json?.full_markdown ||
    review.analysis_json?.sections_markdown?.join("\n\n---\n\n") ||
    "";
  const bodyContent = extractBody(fullContent);
  const hasContent = Boolean(bodyContent?.trim());

  const conclusionText =
    review.conclusion || review.analysis_json?.conclusion || "";

  const refsJson = review.references_json;
  const referencesMarkdownFallback =
    review.analysis_json?.references_markdown || "";

  const markdownComponents = useMemo(() => {
    const hasCitations = Object.keys(citationMap).length > 0;
    if (!hasCitations) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function processChildren(children: any): any {
      if (!children) return children;
      if (typeof children === "string") {
        CITATION_REGEX.lastIndex = 0;
        if (CITATION_REGEX.test(children)) {
          return (
            <TextWithCitations
              text={children}
              paperMap={paperMap}
              citationMap={citationMap}
            />
          );
        }
        return children;
      }
      if (Array.isArray(children)) {
        return children.map((child: unknown, idx: number) => {
          if (typeof child === "string") {
            CITATION_REGEX.lastIndex = 0;
            if (CITATION_REGEX.test(child)) {
              return (
                <TextWithCitations
                  key={idx}
                  text={child}
                  paperMap={paperMap}
                  citationMap={citationMap}
                />
              );
            }
          }
          return child;
        });
      }
      return children;
    }
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p: ({ children, ...props }: any) => (
        <p {...props}>{processChildren(children)}</p>
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li: ({ children, ...props }: any) => (
        <li {...props}>{processChildren(children)}</li>
      ),
    };
  }, [citationMap, paperMap]);

  return (
    <div
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "24px 20px 48px",
      }}
    >
      <button
        onClick={onBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 20,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(148,163,184,0.15)",
          color: "#cbd5e1",
          padding: "10px 14px",
          borderRadius: 10,
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={16} />
        返回综述列表
      </button>

      <div
        style={{
          background: "rgba(15,23,42,0.78)",
          border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 18,
          padding: 28,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* ─── Header ─── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(99,102,241,0.15)",
                  color: "#c4b5fd",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <FileText size={14} />
                Review #{review.id}
              </span>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(34,197,94,0.12)",
                  color: "#86efac",
                  fontSize: 12,
                }}
              >
                {review.status}
              </span>
            </div>

            <h1
              style={{
                margin: "0 0 12px",
                color: "#f8fafc",
                fontSize: 30,
                lineHeight: 1.25,
              }}
            >
              {review.title}
            </h1>

            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Calendar size={14} />
                {new Date(review.created_at).toLocaleString()}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <BookOpen size={14} />
                {review.paper_count} 篇文献
              </span>
            </div>
          </div>

          {/* ─── Action Buttons ─── */}
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <button
              onClick={() => onExportMarkdown(review)}
              disabled={exporting === review.id}
              style={{
                padding: "10px 14px",
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
              导出 Markdown
            </button>

            <button
              onClick={() => onExportDocx(review)}
              disabled={exporting === review.id}
              style={{
                padding: "10px 14px",
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
              <FileDown size={15} />
              导出 DOCX
            </button>

            <button
              onClick={() => onExportPdf(review)}
              disabled={exporting === review.id}
              style={{
                padding: "10px 14px",
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
              <FileDown size={15} />
              导出 PDF
            </button>

            <button
              onClick={() => onGenerateAbstract(review.id)}
              disabled={generating !== null}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(168,85,247,0.22)",
                background: "rgba(168,85,247,0.12)",
                color: "#e9d5ff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Sparkles size={15} />
              {generating === "abstract" ? "生成中\u2026" : "生成摘要"}
            </button>

            <button
              onClick={() => onGenerateConclusion(review.id)}
              disabled={generating !== null}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(59,130,246,0.22)",
                background: "rgba(59,130,246,0.12)",
                color: "#bfdbfe",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Sparkles size={15} />
              {generating === "conclusion" ? "生成中\u2026" : "生成结论"}
            </button>

            <button
              onClick={() => onValidate(review.id)}
              disabled={validating}
              style={{
                padding: "10px 14px",
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
              {validating ? "校验中\u2026" : "校验引用"}
            </button>

            <button
              onClick={() => onClaimsEvidence(review.id)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(245,158,11,0.22)",
                background: "rgba(245,158,11,0.12)",
                color: "#fde68a",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <BookOpen size={15} />
              论点证据
            </button>
          </div>
        </div>

        {/* ─── Abstract Section (Editable) ─── */}
        <EditableSection
          content={review.abstract || ""}
          editing={editingSection === "abstract"}
          editText={editText}
          saving={saving}
          onStartEditing={() =>
            onStartEditing("abstract", review.abstract || "")
          }
          onCancel={onCancelEditing}
          onSave={() => onSaveSection("abstract", editText)}
          onTextChange={onSetEditText}
          label="摘要"
          accentColor="rgba(168,85,247,0.25)"
          accentTextColor="#c4b5fd"
          sectionBackground="rgba(255,255,255,0.03)"
          sectionBorder="1px solid rgba(148,163,184,0.12)"
          placeholder="尚未生成摘要。点击上方「生成摘要」或「编辑」手动添加。"
        />

        {/* ─── Body Content Section ─── */}
        <section
          style={{
            marginTop: 20,
            padding: 22,
            borderRadius: 16,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(148,163,184,0.12)",
          }}
        >
          <h3
            style={{
              margin: "0 0 16px",
              color: "#f8fafc",
              fontSize: 20,
            }}
          >
            综述正文
          </h3>

          {hasContent ? (
            <div
              style={{
                color: "#dbeafe",
                lineHeight: 1.9,
                fontSize: 15,
              }}
            >
              <ReactMarkdown components={markdownComponents}>
                {bodyContent}
              </ReactMarkdown>
            </div>
          ) : (
            <p style={{ margin: 0, color: "#94a3b8" }}>
              该综述尚未生成正文内容。
            </p>
          )}
        </section>

        {/* ─── Conclusion Section (Editable) ─── */}
        <div style={{ marginTop: 20 }}>
          <EditableSection
            content={conclusionText}
            editing={editingSection === "conclusion"}
            editText={editText}
            saving={saving}
            onStartEditing={() => onStartEditing("conclusion", conclusionText)}
            onCancel={onCancelEditing}
            onSave={() => onSaveSection("conclusion", editText)}
            onTextChange={onSetEditText}
            label="结论"
            accentColor="rgba(59,130,246,0.25)"
            accentTextColor="#93c5fd"
            sectionBackground="rgba(59,130,246,0.05)"
            sectionBorder="1px solid rgba(59,130,246,0.12)"
            placeholder="尚未生成结论。点击上方「生成结论」或「编辑」手动添加。"
          />
        </div>

        {/* ─── References Section ─── */}
        {(refsJson?.items?.length || referencesMarkdownFallback) && (
          <section
            style={{
              marginTop: 20,
              padding: 22,
              borderRadius: 16,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(148,163,184,0.12)",
            }}
          >
            <h3
              style={{
                margin: "0 0 16px",
                color: "#f8fafc",
                fontSize: 20,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              参考文献
              {refsJson?.style && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: "rgba(99,102,241,0.12)",
                    color: "#a5b4fc",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                  }}
                >
                  {refsJson.style}
                </span>
              )}
            </h3>
            <div
              style={{
                color: "#cbd5e1",
                lineHeight: 1.8,
                fontSize: 14,
              }}
            >
              {refsJson?.items?.length ? (
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 24,
                    listStyleType: "decimal",
                  }}
                >
                  {refsJson.items
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((ref, idx) => (
                      <li
                        key={idx}
                        style={{
                          marginBottom: 8,
                          paddingLeft: 4,
                        }}
                      >
                        {ref.formatted}
                      </li>
                    ))}
                </ol>
              ) : (
                <ReactMarkdown components={markdownComponents}>
                  {referencesMarkdownFallback}
                </ReactMarkdown>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
