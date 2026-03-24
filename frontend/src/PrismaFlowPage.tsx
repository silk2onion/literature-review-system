import { useEffect, useState } from "react";

const API_BASE_URL = "http://localhost:5444";

type PrismaStageCount = {
  stage: string;
  count: number;
  excluded_count: number;
};

type PrismaStats = {
  success: boolean;
  crawl_job_id?: number | null;
  total: number;
  stages: PrismaStageCount[];
  exclusion_reasons: Record<string, number>;
  search_strategy?: Record<string, unknown> | null;
};

type CrawlJobOption = {
  id: number;
  query: string;
  created_at: string;
};

const STAGE_META: Record<
  string,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  identification: {
    label: "识别 Identification",
    icon: "🔍",
    color: "#6366f1",
    bgColor: "#eef2ff",
  },
  screening: {
    label: "筛选 Screening",
    icon: "📋",
    color: "#0ea5e9",
    bgColor: "#f0f9ff",
  },
  eligibility: {
    label: "资格 Eligibility",
    icon: "✅",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  included: {
    label: "纳入 Included",
    icon: "📎",
    color: "#22c55e",
    bgColor: "#f0fdf4",
  },
};

export default function PrismaFlowPage() {
  const [stats, setStats] = useState<PrismaStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crawlJobId, setCrawlJobId] = useState<string>("");
  const [crawlJobs, setCrawlJobs] = useState<CrawlJobOption[]>([]);

  // Fetch available crawl jobs for the filter dropdown
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/crawl/jobs?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        const jobs = (data.jobs || data || []).map(
          (j: Record<string, unknown>) => ({
            id: j.id as number,
            query: (j.query as string) || "未知查询",
            created_at: (j.created_at as string) || "",
          }),
        );
        setCrawlJobs(jobs);
      })
      .catch((err) => console.error("Failed to load crawl jobs:", err));
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = crawlJobId
        ? `${API_BASE_URL}/api/staging-papers/prisma-stats?crawl_job_id=${crawlJobId}`
        : `${API_BASE_URL}/api/staging-papers/prisma-stats`;
      const resp = await fetch(url);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`请求失败: ${resp.status} - ${text}`);
      }
      const data: PrismaStats = await resp.json();
      setStats(data);
    } catch (err) {
      setError((err as { message?: string })?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = () => {
    fetchStats();
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>PRISMA-ScR 筛选流程</h1>
          <p>
            基于 PRISMA-ScR（Scoping Review
            扩展版）标准的四阶段筛选流程可视化，追踪文献从识别到最终纳入的完整链路
          </p>
        </div>
      </header>

      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 0",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
          抓取任务过滤:
        </label>
        <select
          value={crawlJobId}
          onChange={(e) => setCrawlJobId(e.target.value)}
          style={{
            height: 36,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            backgroundColor: "#ffffff",
            color: "#0f172a",
            fontSize: 13,
            minWidth: 280,
            cursor: "pointer",
          }}
        >
          <option value="">全部任务（汇总）</option>
          {crawlJobs.map((job) => (
            <option key={job.id} value={job.id}>
              #{job.id} — {job.query} ({job.created_at?.slice(0, 10) || "?"})
            </option>
          ))}
        </select>
        <button
          onClick={handleFilter}
          disabled={loading}
          style={{
            height: 36,
            padding: "0 20px",
            borderRadius: 6,
            border: "none",
            background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "加载中..." : "查询"}
        </button>
        <button
          onClick={() => fetchStats()}
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            backgroundColor: "#ffffff",
            color: "#374151",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          🔄 刷新
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* Total Count Banner */}
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 8,
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 14, color: "#475569" }}>
              暂存文献总量:{" "}
              <strong style={{ color: "#0f172a", fontSize: 18 }}>
                {stats.total}
              </strong>{" "}
              篇
            </span>
            {stats.crawl_job_id && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                过滤: 抓取任务 #{stats.crawl_job_id}
              </span>
            )}
          </div>

          {/* PRISMA Flow Diagram */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              alignItems: "center",
              marginBottom: 32,
            }}
          >
            {stats.stages.map((stage, idx) => {
              const meta = STAGE_META[stage.stage];
              if (!meta) return null;
              return (
                <div
                  key={stage.stage}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  {/* Arrow from previous stage */}
                  {idx > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        margin: "4px 0",
                      }}
                    >
                      <div
                        style={{
                          width: 2,
                          height: 20,
                          backgroundColor: "#cbd5e1",
                        }}
                      />
                      <div
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: "6px solid transparent",
                          borderRight: "6px solid transparent",
                          borderTop: "8px solid #cbd5e1",
                        }}
                      />
                    </div>
                  )}

                  {/* Stage Box */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      width: "100%",
                      maxWidth: 700,
                      borderRadius: 10,
                      border: `2px solid ${meta.color}40`,
                      backgroundColor: meta.bgColor,
                      overflow: "hidden",
                    }}
                  >
                    {/* Left color bar */}
                    <div
                      style={{
                        width: 6,
                        backgroundColor: meta.color,
                        flexShrink: 0,
                      }}
                    />

                    {/* Content */}
                    <div
                      style={{
                        flex: 1,
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 24 }}>{meta.icon}</span>
                        <div>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: "#0f172a",
                            }}
                          >
                            {meta.label}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#64748b",
                              marginTop: 2,
                            }}
                          >
                            {stage.stage === "identification" &&
                              "数据库检索返回的全部记录"}
                            {stage.stage === "screening" &&
                              "标题/摘要初筛后保留的记录"}
                            {stage.stage === "eligibility" &&
                              "全文审查后符合资格的记录"}
                            {stage.stage === "included" &&
                              "最终纳入综述分析的记录"}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                          textAlign: "center",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 28,
                              fontWeight: 700,
                              color: meta.color,
                            }}
                          >
                            {stage.count}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            篇
                          </div>
                        </div>
                        {stage.excluded_count > 0 && (
                          <div
                            style={{
                              borderLeft: "1px solid #e2e8f0",
                              paddingLeft: 16,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: "#ef4444",
                              }}
                            >
                              -{stage.excluded_count}
                            </div>
                            <div style={{ fontSize: 11, color: "#ef4444" }}>
                              排除
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Exclusion side branch */}
                  {stage.excluded_count > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        maxWidth: 700,
                        justifyContent: "flex-end",
                        marginTop: -8,
                        paddingRight: 20,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 6,
                          backgroundColor: "#fef2f2",
                          border: "1px solid #fecaca",
                          fontSize: 11,
                          color: "#dc2626",
                        }}
                      >
                        ← 排除 {stage.excluded_count} 篇（有记录原因）
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Exclusion Reasons Breakdown */}
          {Object.keys(stats.exclusion_reasons).length > 0 && (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                marginBottom: 24,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 20px",
                  backgroundColor: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                📊 排除原因分布
              </div>
              <div style={{ padding: "12px 20px" }}>
                {Object.entries(stats.exclusion_reasons)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => {
                    const totalExcluded = Object.values(
                      stats.exclusion_reasons,
                    ).reduce((s, v) => s + v, 0);
                    const pct =
                      totalExcluded > 0
                        ? ((count / totalExcluded) * 100).toFixed(1)
                        : "0";
                    return (
                      <div
                        key={reason}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "8px 0",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <div
                          style={{ flex: 1, fontSize: 13, color: "#374151" }}
                        >
                          {reason}
                        </div>
                        <div
                          style={{
                            width: 200,
                            height: 8,
                            backgroundColor: "#f1f5f9",
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              backgroundColor: "#ef4444",
                              borderRadius: 4,
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            width: 60,
                            textAlign: "right",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#dc2626",
                          }}
                        >
                          {count}
                        </div>
                        <div
                          style={{
                            width: 50,
                            textAlign: "right",
                            fontSize: 11,
                            color: "#9ca3af",
                          }}
                        >
                          {pct}%
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Search Strategy Card */}
          {stats.search_strategy && (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                marginBottom: 24,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 20px",
                  backgroundColor: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                🔬 搜索策略记录
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 1fr",
                    gap: "8px 16px",
                    fontSize: 13,
                  }}
                >
                  {!!stats.search_strategy.query_keywords && (
                    <>
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        检索关键词:
                      </span>
                      <span style={{ color: "#0f172a" }}>
                        {String(stats.search_strategy.query_keywords)}
                      </span>
                    </>
                  )}
                  {!!stats.search_strategy.sources && (
                    <>
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        数据源:
                      </span>
                      <span style={{ color: "#0f172a" }}>
                        {Array.isArray(stats.search_strategy.sources)
                          ? (stats.search_strategy.sources as string[]).join(
                              ", ",
                            )
                          : String(stats.search_strategy.sources)}
                      </span>
                    </>
                  )}
                  {!!stats.search_strategy.year_range && (
                    <>
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        年份范围:
                      </span>
                      <span style={{ color: "#0f172a" }}>
                        {String(stats.search_strategy.year_range)}
                      </span>
                    </>
                  )}
                  {stats.search_strategy.max_results !== undefined && (
                    <>
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        最大结果数:
                      </span>
                      <span style={{ color: "#0f172a" }}>
                        {String(stats.search_strategy.max_results)}
                      </span>
                    </>
                  )}
                  {stats.search_strategy.exhaustive !== undefined && (
                    <>
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        穷尽检索:
                      </span>
                      <span
                        style={{
                          color: stats.search_strategy.exhaustive
                            ? "#22c55e"
                            : "#94a3b8",
                        }}
                      >
                        {stats.search_strategy.exhaustive ? "✅ 是" : "否"}
                      </span>
                    </>
                  )}
                  {!!stats.search_strategy.boolean_syntax && (
                    <>
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        布尔语法:
                      </span>
                      <code
                        style={{
                          color: "#0f172a",
                          backgroundColor: "#f1f5f9",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        {String(stats.search_strategy.boolean_syntax)}
                      </code>
                    </>
                  )}
                  {!!stats.search_strategy.timestamp && (
                    <>
                      <span style={{ color: "#64748b", fontWeight: 500 }}>
                        执行时间:
                      </span>
                      <span style={{ color: "#94a3b8" }}>
                        {String(stats.search_strategy.timestamp)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state for no exclusion reasons */}
          {Object.keys(stats.exclusion_reasons).length === 0 &&
            stats.total > 0 && (
              <div
                style={{
                  padding: "24px",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: 13,
                  borderRadius: 10,
                  border: "1px dashed #e2e8f0",
                  marginBottom: 24,
                }}
              >
                尚无排除原因记录。在暂存文献库中拒绝文献时可以填写排除原因，或使用批量筛选功能推进
                PRISMA 阶段。
              </div>
            )}
        </>
      )}

      {!stats && !loading && !error && (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 14,
          }}
        >
          点击"查询"按钮加载 PRISMA 筛选统计数据
        </div>
      )}
    </div>
  );
}
