/**
 * ReviewOrchestratePage.tsx
 * 一键端到端综述生成页面：主题 → 框架 → 文献检索 → RAG 召回 → 生成综述 → 参考文献
 */
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "../api/config";

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

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: "等待开始",
  framework: "正在生成综述框架…",
  searching: "正在批量检索文献…",
  embedding: "正在生成文献向量…",
  generating: "正在按节生成综述（RAG + LLM）…",
  references: "正在生成参考文献列表…",
  done: "生成完成 ✓",
  error: "生成失败 ✗",
};

export default function ReviewOrchestratePage() {
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
      setError("请填写研究主题和关键词");
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

      // Scroll to result
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    } catch (err: any) {
      setError(err.message || "未知错误");
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
        <h2 style={styles.cardTitle}>📝 一键生成文献综述</h2>
        <p style={styles.subtitle}>
          输入研究主题 → 自动生成框架 → 批量检索文献 → RAG 召回 → 生成带引用标注的综述
        </p>

        <div style={styles.formGrid}>
          {/* 主题 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>研究主题 *</label>
            <input
              id="orchestrate-topic"
              style={styles.input}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：TOD 与文化遗产保护的协同机制"
              disabled={isRunning}
            />
          </div>

          {/* 关键词 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>关键词 * (逗号分隔)</label>
            <input
              id="orchestrate-keywords"
              style={styles.input}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例如：TOD, heritage conservation, sustainable urban design"
              disabled={isRunning}
            />
          </div>

          {/* 配置行 */}
          <div style={styles.configRow}>
            <div style={styles.configItem}>
              <label style={styles.label}>文献数</label>
              <input
                id="orchestrate-paper-limit"
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
              <label style={styles.label}>语言</label>
              <select
                id="orchestrate-language"
                style={{ ...styles.input, width: 100 }}
                value={language}
                onChange={(e) => setLanguage(e.target.value as "zh-CN" | "en")}
                disabled={isRunning}
              >
                <option value="en">English</option>
                <option value="zh-CN">中文</option>
              </select>
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>引用格式</label>
              <select
                id="orchestrate-citation-style"
                style={{ ...styles.input, width: 140 }}
                value={citationStyle}
                onChange={(e) => setCitationStyle(e.target.value)}
                disabled={isRunning}
              >
                <option value="harvard">Harvard (默认)</option>
                <option value="apa">APA 7th</option>
                <option value="ieee">IEEE [1]</option>
                <option value="chicago">Chicago</option>
                <option value="vancouver">Vancouver (1)</option>
              </select>
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>起始年</label>
              <input
                id="orchestrate-year-from"
                type="number"
                style={{ ...styles.input, width: 90 }}
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value ? Number(e.target.value) : "")}
                placeholder="2015"
                disabled={isRunning}
              />
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>截止年</label>
              <input
                id="orchestrate-year-to"
                type="number"
                style={{ ...styles.input, width: 90 }}
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value ? Number(e.target.value) : "")}
                placeholder="2026"
                disabled={isRunning}
              />
            </div>

            <div style={styles.configItem}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={useLocalOnly}
                  onChange={(e) => setUseLocalOnly(e.target.checked)}
                  disabled={isRunning}
                  style={{ marginRight: 6 }}
                />
                仅本地库
              </label>
            </div>
          </div>

          {/* 自定义指令 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>自定义指令 (可选)</label>
            <textarea
              id="orchestrate-instructions"
              style={{ ...styles.input, minHeight: 60 }}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="例如：请重点关注亚洲案例"
              disabled={isRunning}
            />
          </div>
        </div>

        {/* 提交按钮 */}
        <button
          id="orchestrate-submit"
          onClick={handleSubmit}
          disabled={isRunning}
          style={{
            ...styles.submitBtn,
            opacity: isRunning ? 0.6 : 1,
            cursor: isRunning ? "not-allowed" : "pointer",
          }}
        >
          {isRunning ? "⏳ 正在生成中…" : "🚀 一键生成综述"}
        </button>

        {/* Pipeline 进度 */}
        {stage !== "idle" && (
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: stage === "done" ? "100%" : stage === "error" ? "100%" : "60%",
                backgroundColor:
                  stage === "done" ? "#22c55e" : stage === "error" ? "#ef4444" : "#6366f1",
              }}
            />
            <span style={styles.progressLabel}>{STAGE_LABELS[stage]}</span>
          </div>
        )}

        {error && <div style={styles.errorMsg}>❌ {error}</div>}
      </div>

      {/* === 结果区域 === */}
      {result && (
        <div ref={resultRef} style={styles.resultCard}>
          {/* Tab Bar */}
          <div style={styles.tabBar}>
            <button
              id="result-tab-preview"
              onClick={() => setActiveResultTab("preview")}
              style={{
                ...styles.tab,
                ...(activeResultTab === "preview" ? styles.tabActive : {}),
              }}
            >
              📄 综述预览
            </button>
            <button
              id="result-tab-framework"
              onClick={() => setActiveResultTab("framework")}
              style={{
                ...styles.tab,
                ...(activeResultTab === "framework" ? styles.tabActive : {}),
              }}
            >
              🏗️ 框架
            </button>
            <button
              id="result-tab-stats"
              onClick={() => setActiveResultTab("stats")}
              style={{
                ...styles.tab,
                ...(activeResultTab === "stats" ? styles.tabActive : {}),
              }}
            >
              📊 统计
            </button>

            <div style={{ flex: 1 }} />
            <button id="result-copy-btn" onClick={handleCopy} style={styles.copyBtn}>
              📋 复制 Markdown
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
                <h3 style={{ color: "#e2e8f0", marginBottom: 12 }}>{result.framework.title}</h3>
                <p style={{ color: "#94a3b8", marginBottom: 16 }}>
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
              <div style={{ color: "#cbd5e1" }}>
                <div style={styles.statRow}>
                  <span>Review ID</span>
                  <span style={styles.statValue}>{result.review_id}</span>
                </div>
                <div style={styles.statRow}>
                  <span>总检索文献数</span>
                  <span style={styles.statValue}>{result.stats.total_papers_searched}</span>
                </div>
                <div style={styles.statRow}>
                  <span>实际引用文献数</span>
                  <span style={styles.statValue}>{result.stats.total_papers_cited}</span>
                </div>
                <div style={styles.statRow}>
                  <span>章节数</span>
                  <span style={styles.statValue}>{result.stats.sections_count}</span>
                </div>
                <div style={styles.statRow}>
                  <span>引用映射</span>
                  <span style={styles.statValue}>
                    {Object.keys(result.citation_map).length} 条
                  </span>
                </div>

                {Object.keys(result.citation_map).length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ color: "#e2e8f0", marginBottom: 8 }}>引用映射表</h4>
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

// --- Inline Styles ---
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px 32px",
    maxWidth: 960,
    margin: "0 auto",
  },
  inputCard: {
    background: "rgba(30, 41, 59, 0.7)",
    borderRadius: 12,
    padding: "24px 28px",
    border: "1px solid rgba(148, 163, 184, 0.15)",
    marginBottom: 24,
  },
  cardTitle: {
    color: "#e2e8f0",
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 4px 0",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 13,
    margin: "0 0 20px 0",
  },
  formGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  label: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  input: {
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#e2e8f0",
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
    gap: 4,
  },
  submitBtn: {
    marginTop: 18,
    width: "100%",
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.05em",
    transition: "all 0.2s",
  },
  progressBar: {
    marginTop: 14,
    height: 28,
    borderRadius: 14,
    background: "rgba(15, 23, 42, 0.5)",
    position: "relative" as const,
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: 14,
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
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: 600,
    zIndex: 1,
  },
  errorMsg: {
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 13,
  },
  resultCard: {
    background: "rgba(30, 41, 59, 0.7)",
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.15)",
    overflow: "hidden",
  },
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    padding: "0 4px",
    alignItems: "center",
  },
  tab: {
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tabActive: {
    color: "#e2e8f0",
    borderBottom: "2px solid #6366f1",
  },
  copyBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "transparent",
    color: "#94a3b8",
    fontSize: 12,
    cursor: "pointer",
    marginRight: 8,
  },
  tabContent: {
    padding: "20px 24px",
    minHeight: 300,
    maxHeight: "70vh",
    overflow: "auto",
  },
  markdownBody: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 1.8,
  },
  frameworkSection: {
    background: "rgba(15, 23, 42, 0.4)",
    borderRadius: 8,
    padding: "14px 16px",
    marginBottom: 10,
    border: "1px solid rgba(148, 163, 184, 0.08)",
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 4,
  },
  sectionDesc: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 8,
  },
  sectionKeywords: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  keywordTag: {
    background: "rgba(99, 102, 241, 0.15)",
    color: "#a5b4fc",
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 4,
    fontWeight: 600,
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
    fontSize: 14,
  },
  statValue: {
    fontWeight: 700,
    color: "#a5b4fc",
  },
  citationRow: {
    display: "flex",
    gap: 12,
    alignItems: "baseline",
    padding: "4px 0",
    borderBottom: "1px solid rgba(148, 163, 184, 0.05)",
  },
  citationKey: {
    color: "#6366f1",
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  },
  citationTitle: {
    color: "#94a3b8",
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
