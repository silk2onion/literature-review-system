/**
 * ReviewOrchestratePage.tsx
 * 一键端到端综述生成页面：主题 → 框架 → 文献检索 → RAG 召回 → 生成综述 → 参考文献
 */
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "../api/config";
import { useLocale } from "../hooks/useLocale";

interface FrameworkSection {
  id: string;
  title: string;
  description: string;
  search_keywords: string[];
}

interface ReviewFramework {
  title: string;
  abstract_description: string;
  sections: FrameworkSection[];
}

interface SectionResult {
  section_id: string;
  section_title: string;
  text: string;
  cited_paper_ids: number[];
}

interface OrchestrationResult {
  review_id: number;
  title: string;
  framework: ReviewFramework;
  sections: SectionResult[];
  full_markdown: string;
  references_markdown: string;
  citation_map: Record<string, any>;
  stats: Record<string, any>;
}

type PipelineStage =
  | "idle"
  | "framework"
  | "searching"
  | "embedding"
  | "generating"
  | "references"
  | "done"
  | "error";

// STAGE_LABELS will be resolved inside the component via t() calls

export default function ReviewOrchestratePage() {
  const { t } = useLocale();

  const STAGE_LABELS: Record<PipelineStage, string> = {
    idle: t("review.orchestrate.stage.idle"),
    framework: t("review.orchestrate.stage.framework"),
    searching: t("review.orchestrate.stage.searching"),
    embedding: t("review.orchestrate.stage.embedding"),
    generating: t("review.orchestrate.stage.generating"),
    references: t("review.orchestrate.stage.references"),
    done: t("review.orchestrate.stage.done"),
    error: t("review.orchestrate.stage.error"),
  };

  // --- Form State ---
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [paperLimit, setPaperLimit] = useState(30);
  const [language, setLanguage] = useState<"zh-CN" | "en">("en");
  const [citationStyle, setCitationStyle] = useState("harvard");
  const [yearFrom, setYearFrom] = useState<number | "">("");
  const [yearTo, setYearTo] = useState<number | "">("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [useLocalOnly, setUseLocalOnly] = useState(false);

  // --- Pipeline State ---
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState("");
  const [activeResultTab, setActiveResultTab] = useState<"preview" | "framework" | "stats">("preview");

  const resultRef = useRef<HTMLDivElement>(null);

  // --- Submit ---
  const handleSubmit = async () => {
    if (!topic.trim() || !keywords.trim()) {
      setError(t("review.orchestrate.errorTopicKeywords"));
      return;
    }

    setError("");
    setResult(null);
    setStage("framework");

    const payload = {
      topic: topic.trim(),
      keywords: keywords.split(/[,;，；\s]+/).filter(Boolean),
      paper_limit: paperLimit,
      language,
      citation_style: citationStyle,
      year_from: yearFrom || undefined,
      year_to: yearTo || undefined,
      custom_instructions: customInstructions.trim() || undefined,
      use_local_only: useLocalOnly,
    };

    try {
      const resp = await fetch(`${API_BASE_URL}/api/reviews/orchestrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        throw new Error(errData?.detail || `HTTP ${resp.status}`);
      }

      const data: OrchestrationResult = await resp.json();
      setResult(data);
      setStage("done");

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    } catch (err: any) {
      setError(err.message || t("review.orchestrate.unknownError"));
      setStage("error");
    }
  };

  const handleCopy = () => {
    if (result?.full_markdown) {
      navigator.clipboard.writeText(result.full_markdown);
    }
  };

  const isRunning = !["idle", "done", "error"].includes(stage);

  return (
    <div style={styles.container}>
      {/* === 输入区域 === */}
      <div style={styles.inputCard}>
        <h2 style={styles.cardTitle}>{t("review.orchestrate.title")}</h2>
        <p style={styles.subtitle}>
          {t("review.orchestrate.subtitle")}
        </p>

        <div style={styles.formGrid}>
          {/* 主题 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>{t("review.orchestrate.topic")}</label>
            <input
              style={styles.input}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("review.orchestrate.topicPlaceholder")}
              disabled={isRunning}
            />
          </div>

          {/* 关键词 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>{t("review.orchestrate.keywords")}</label>
            <input
              style={styles.input}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={t("review.orchestrate.keywordsPlaceholder")}
              disabled={isRunning}
            />
          </div>

          {/* 配置行 */}
          <div style={styles.configRow}>
            <div style={styles.configItem}>
              <label style={styles.label}>{t("review.orchestrate.paperLimit")}</label>
              <input
                type="number"
                style={{ ...styles.input, width: 80 }}
                value={paperLimit}
                onChange={(e) => setPaperLimit(Number(e.target.value))}
                min={5}
                max={100}
                disabled={isRunning}
              />
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>{t("review.orchestrate.language")}</label>
              <select
                style={{ ...styles.input, width: 110 }}
                value={language}
                onChange={(e) => setLanguage(e.target.value as "zh-CN" | "en")}
                disabled={isRunning}
              >
                <option value="en">English</option>
                <option value="zh-CN">{t("review.orchestrate.langZh")}</option>
              </select>
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>{t("review.orchestrate.citationStyle")}</label>
              <select
                style={{ ...styles.input, width: 150 }}
                value={citationStyle}
                onChange={(e) => setCitationStyle(e.target.value)}
                disabled={isRunning}
              >
                <option value="harvard">Harvard</option>
                <option value="apa">APA 7th</option>
                <option value="ieee">IEEE [1]</option>
                <option value="chicago">Chicago</option>
                <option value="vancouver">Vancouver (1)</option>
              </select>
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>{t("review.orchestrate.yearFrom")}</label>
              <input
                type="number"
                style={{ ...styles.input, width: 90 }}
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value ? Number(e.target.value) : "")}
                placeholder="2015"
                disabled={isRunning}
              />
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>{t("review.orchestrate.yearTo")}</label>
              <input
                type="number"
                style={{ ...styles.input, width: 90 }}
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value ? Number(e.target.value) : "")}
                placeholder="2026"
                disabled={isRunning}
              />
            </div>

            <div style={styles.configItem}>
              <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={useLocalOnly}
                  onChange={(e) => setUseLocalOnly(e.target.checked)}
                  disabled={isRunning}
                />
                {t("review.orchestrate.localOnly")}
              </label>
            </div>
          </div>

          {/* 自定义指令 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>{t("review.orchestrate.customInstructions")}</label>
            <textarea
              style={{ ...styles.input, minHeight: 60, resize: "vertical" as const }}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder={t("review.orchestrate.customInstructionsPlaceholder")}
              disabled={isRunning}
            />
          </div>
        </div>

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={isRunning}
          style={{
            ...styles.submitBtn,
            opacity: isRunning ? 0.6 : 1,
            cursor: isRunning ? "not-allowed" : "pointer",
          }}
        >
          {isRunning ? t("review.orchestrate.generating") : t("review.orchestrate.generate")}
        </button>

        {/* Pipeline 进度 */}
        {stage !== "idle" && (
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: stage === "done" ? "100%" : stage === "error" ? "100%" : "60%",
                backgroundColor:
                  stage === "done" ? "#22c55e" : stage === "error" ? "#ef4444" : "#007AFF",
              }}
            />
            <span style={styles.progressLabel}>{STAGE_LABELS[stage]}</span>
          </div>
        )}

        {error && <div style={styles.errorMsg}>{error}</div>}
      </div>

      {/* === 结果区域 === */}
      {result && (
        <div ref={resultRef} style={styles.resultCard}>
          {/* Tab Bar */}
          <div style={styles.tabBar}>
            {(["preview", "framework", "stats"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveResultTab(tab)}
                style={{
                  ...styles.tab,
                  ...(activeResultTab === tab ? styles.tabActive : {}),
                }}
              >
                {tab === "preview" ? t("review.orchestrate.tabPreview") : tab === "framework" ? t("review.orchestrate.tabFramework") : t("review.orchestrate.tabStats")}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={handleCopy} style={styles.copyBtn}>
              {t("review.orchestrate.copyMarkdown")}
            </button>
          </div>

          {/* Tab Content */}
          <div style={styles.tabContent}>
            {activeResultTab === "preview" && (
              <div style={styles.markdownBody} className="markdown-body">
                <ReactMarkdown>{result.full_markdown}</ReactMarkdown>
              </div>
            )}

            {activeResultTab === "framework" && (
              <div>
                <h3 style={{ color: "#1C1C1E", margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>
                  {result.framework.title}
                </h3>
                <p style={{ color: "#8E8E93", marginBottom: 20, fontSize: 14 }}>
                  {result.framework.abstract_description}
                </p>
                {result.framework.sections.map((s) => (
                  <div key={s.id} style={styles.frameworkSection}>
                    <div style={styles.sectionTitle}>
                      {s.id}. {s.title}
                    </div>
                    <div style={styles.sectionDesc}>{s.description}</div>
                    <div style={styles.sectionKeywords}>
                      {s.search_keywords.map((kw) => (
                        <span key={kw} style={styles.keywordTag}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeResultTab === "stats" && (
              <div>
                {[
                  ["Review ID", result.review_id],
                  [t("review.orchestrate.statTotalSearched"), result.stats.total_papers_searched],
                  [t("review.orchestrate.statTotalCited"), result.stats.total_papers_cited],
                  [t("review.orchestrate.statSections"), result.stats.sections_count],
                  [t("review.orchestrate.statCitationMap"), `${Object.keys(result.citation_map).length} ${t("review.orchestrate.statEntries")}`],
                ].map(([label, value]) => (
                  <div key={String(label)} style={styles.statRow}>
                    <span style={{ color: "#3C3C43" }}>{label}</span>
                    <span style={styles.statValue}>{String(value)}</span>
                  </div>
                ))}

                {Object.keys(result.citation_map).length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <h4 style={{ color: "#1C1C1E", margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
                      {t("review.orchestrate.citationMapTable")}
                    </h4>
                    <div style={{ maxHeight: 300, overflow: "auto" }}>
                      {Object.entries(result.citation_map).map(([key, info]) => (
                        <div key={key} style={styles.citationRow}>
                          <code style={styles.citationKey}>{key}</code>
                          <span style={styles.citationTitle}>
                            {typeof info === "object" ? info.title || "(untitled)" : String(info)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Inline Styles (Mac Light Theme) ---
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px 32px",
    maxWidth: 960,
    margin: "0 auto",
  },
  inputCard: {
    background: "#FFFFFF",
    borderRadius: 14,
    padding: "28px 28px",
    border: "1px solid #E5E5EA",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    marginBottom: 24,
  },
  cardTitle: {
    color: "#1C1C1E",
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 4px 0",
  },
  subtitle: {
    color: "#8E8E93",
    fontSize: 13,
    margin: "0 0 24px 0",
    lineHeight: 1.5,
  },
  formGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  label: {
    color: "#3C3C43",
    fontSize: 13,
    fontWeight: 500,
  },
  input: {
    background: "#F5F5F7",
    border: "1px solid #D1D1D6",
    borderRadius: 8,
    padding: "9px 12px",
    color: "#1C1C1E",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
  },
  configRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap" as const,
    alignItems: "flex-end",
  },
  configItem: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  submitBtn: {
    marginTop: 20,
    width: "100%",
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "#007AFF",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 600,
    transition: "all 0.2s",
  },
  progressBar: {
    marginTop: 16,
    height: 32,
    borderRadius: 8,
    background: "#F5F5F7",
    position: "relative" as const,
    overflow: "hidden",
    border: "1px solid #E5E5EA",
  },
  progressFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: 7,
    transition: "width 0.5s ease, background-color 0.3s",
  },
  progressLabel: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#1C1C1E",
    fontSize: 12,
    fontWeight: 600,
    zIndex: 1,
  },
  errorMsg: {
    marginTop: 12,
    padding: "10px 14px",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 8,
    color: "#DC2626",
    fontSize: 13,
  },
  resultCard: {
    background: "#FFFFFF",
    borderRadius: 14,
    border: "1px solid #E5E5EA",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    overflow: "hidden",
  },
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #E5E5EA",
    padding: "0 4px",
    alignItems: "center",
    background: "#FAFAFA",
  },
  tab: {
    padding: "12px 18px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#8E8E93",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tabActive: {
    color: "#007AFF",
    borderBottom: "2px solid #007AFF",
  },
  copyBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #D1D1D6",
    background: "#FFFFFF",
    color: "#3C3C43",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    marginRight: 8,
  },
  tabContent: {
    padding: "24px 28px",
    minHeight: 300,
    maxHeight: "70vh",
    overflow: "auto",
  },
  markdownBody: {
    color: "#1C1C1E",
    fontSize: 14,
    lineHeight: 1.8,
  },
  frameworkSection: {
    background: "#F5F5F7",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 10,
    border: "1px solid #E5E5EA",
  },
  sectionTitle: {
    color: "#1C1C1E",
    fontWeight: 600,
    fontSize: 14,
    marginBottom: 4,
  },
  sectionDesc: {
    color: "#8E8E93",
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 1.5,
  },
  sectionKeywords: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  keywordTag: {
    background: "rgba(99, 102, 241, 0.08)",
    color: "#6366f1",
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 4,
    fontWeight: 500,
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #F0F0F0",
    fontSize: 14,
  },
  statValue: {
    fontWeight: 600,
    color: "#007AFF",
  },
  citationRow: {
    display: "flex",
    gap: 12,
    alignItems: "baseline",
    padding: "6px 0",
    borderBottom: "1px solid #F5F5F7",
  },
  citationKey: {
    color: "#6366f1",
    fontSize: 12,
    whiteSpace: "nowrap" as const,
    background: "#F5F5F7",
    padding: "1px 6px",
    borderRadius: 3,
  },
  citationTitle: {
    color: "#8E8E93",
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
