import { useState, useEffect } from "react";
import { Plus, List } from "lucide-react";
import type {
  CrawlJob,
  CrawlJobPayload,
  CrawlJobResponse,
  CrawlJobListResponse,
} from "../types";
import { API_BASE_URL } from "../api/config";
import { CrawlJobForm, CrawlJobHistory } from "../components/crawler";

export default function CrawlerSearchPage() {
  // 从 sessionStorage 恢复表单状态
  const [activeTab, setActiveTab] = useState<"new" | "history">(() => {
    return (
      (sessionStorage.getItem("crawl_activeTab") as "new" | "history") || "new"
    );
  });

  // Search State — 从缓存恢复
  const [keywords, setKeywords] = useState(
    () => sessionStorage.getItem("crawl_keywords") || "",
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(() => {
    const cached = sessionStorage.getItem("crawl_selectedSources");
    return cached ? JSON.parse(cached) : ["arxiv", "crossref"];
  });
  const [yearFrom, setYearFrom] = useState(
    () => sessionStorage.getItem("crawl_yearFrom") || "",
  );
  const [yearTo, setYearTo] = useState(
    () => sessionStorage.getItem("crawl_yearTo") || "",
  );
  const [maxResults, setMaxResults] = useState(() => {
    const cached = sessionStorage.getItem("crawl_maxResults");
    return cached ? Number(cached) : 200;
  });
  const [exhaustive, setExhaustive] = useState(() => {
    return sessionStorage.getItem("crawl_exhaustive") === "true";
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Jobs State
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [_jobsError, setJobsError] = useState<string | null>(null);
  const [actioningJobId, setActioningJobId] = useState<number | null>(null);

  // 持久化表单状态到 sessionStorage
  useEffect(() => {
    sessionStorage.setItem("crawl_activeTab", activeTab);
  }, [activeTab]);
  useEffect(() => {
    sessionStorage.setItem("crawl_keywords", keywords);
  }, [keywords]);
  useEffect(() => {
    sessionStorage.setItem(
      "crawl_selectedSources",
      JSON.stringify(selectedSources),
    );
  }, [selectedSources]);
  useEffect(() => {
    sessionStorage.setItem("crawl_yearFrom", yearFrom);
  }, [yearFrom]);
  useEffect(() => {
    sessionStorage.setItem("crawl_yearTo", yearTo);
  }, [yearTo]);
  useEffect(() => {
    sessionStorage.setItem("crawl_maxResults", String(maxResults));
  }, [maxResults]);
  useEffect(() => {
    sessionStorage.setItem("crawl_exhaustive", String(exhaustive));
  }, [exhaustive]);

  // Fetch jobs when tab changes to history
  useEffect(() => {
    if (activeTab === "history") {
      fetchJobs();
    }
  }, [activeTab]);

  const fetchJobs = async () => {
    try {
      setJobsLoading(true);
      setJobsError(null);
      const res = await fetch(`${API_BASE_URL}/api/crawl/jobs?skip=0&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data: CrawlJobListResponse = await res.json();
      setJobs(data.items || []);
    } catch (err) {
      setJobsError((err as Error).message);
    } finally {
      setJobsLoading(false);
    }
  };

  const handleSourceToggle = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywords.trim()) {
      setSubmitMessage({ type: "error", text: "请输入关键词" });
      return;
    }
    if (selectedSources.length === 0) {
      setSubmitMessage({ type: "error", text: "请至少选择一个数据源" });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitMessage(null);

      const keywordList = keywords
        .split(/[,，]/)
        .map((k) => k.trim())
        .filter(Boolean);

      // 如果只有一个关键词且包含布尔运算符（OR/AND），保持为单个元素传递
      // 后端的 query_parser 会解析布尔表达式
      const finalKeywords =
        keywordList.length === 1
          ? keywordList
          : keywords.match(/\b(OR|AND)\b/i)
            ? [keywords.trim()]
            : keywordList;

      const payload: CrawlJobPayload = {
        keywords: finalKeywords,
        sources: selectedSources,
        year_from: yearFrom ? Number(yearFrom) : null,
        year_to: yearTo ? Number(yearTo) : null,
        max_results: exhaustive ? 99999 : Number(maxResults),
        page_size: exhaustive ? 200 : 50,
        exhaustive,
      };

      const resp = await fetch(`${API_BASE_URL}/api/crawl/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`创建任务失败: ${text}`);
      }

      const data: CrawlJobResponse = await resp.json();
      setSubmitMessage({
        type: "success",
        text: `任务已创建 (ID: ${data.id})`,
      });

      // Switch to history tab after short delay
      setTimeout(() => {
        setActiveTab("history");
        setKeywords("");
        setSubmitMessage(null);
      }, 1500);
    } catch (err) {
      setSubmitMessage({ type: "error", text: (err as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJobAction = async (
    jobId: number,
    action: "run_once" | "pause" | "resume" | "retry",
  ) => {
    if (
      action === "retry" &&
      !window.confirm("确定要重置该任务进度并重新开始吗？")
    )
      return;

    setActioningJobId(jobId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/crawl/jobs/${jobId}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Action failed");
      await fetchJobs();
      // run_once 可能需要几秒才能完成（如 Semantic Scholar 限速），延迟再刷新一次
      if (action === "run_once") {
        setTimeout(() => fetchJobs(), 3000);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActioningJobId(null);
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f9fafb",
  };

  const headerStyle: React.CSSProperties = {
    padding: "24px 32px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    backdropFilter: "blur(8px)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  const tabContainerStyle: React.CSSProperties = {
    display: "flex",
    padding: "4px",
    backgroundColor: "#f3f4f6",
    borderRadius: "8px",
    width: "fit-content",
    flexShrink: 0,
  };

  const getTabStyle = (isActive: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 16px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    backgroundColor: isActive ? "#ffffff" : "transparent",
    color: isActive ? "#111827" : "#6b7280",
    boxShadow: isActive ? "0 1px 2px rgba(0, 0, 0, 0.05)" : "none",
    transition: "all 0.2s",
  });

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: "32px",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    maxWidth: "896px",
    margin: "0 auto",
    padding: activeTab === "new" ? "32px" : "0",
    overflow: "hidden",
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "#111827",
                margin: 0,
              }}
            >
              文献检索
            </h1>
            <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
              创建新的检索任务或管理现有任务进度
            </p>
          </div>
        </div>

        <div style={tabContainerStyle}>
          <button
            onClick={() => setActiveTab("new")}
            style={getTabStyle(activeTab === "new")}
          >
            <Plus size={16} />
            新建任务
          </button>
          <button
            onClick={() => setActiveTab("history")}
            style={getTabStyle(activeTab === "history")}
          >
            <List size={16} />
            任务历史
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        <div style={cardStyle}>
          {activeTab === "new" ? (
            <CrawlJobForm
              keywords={keywords}
              setKeywords={setKeywords}
              selectedSources={selectedSources}
              onSourceToggle={handleSourceToggle}
              yearFrom={yearFrom}
              setYearFrom={setYearFrom}
              yearTo={yearTo}
              setYearTo={setYearTo}
              maxResults={maxResults}
              setMaxResults={setMaxResults}
              exhaustive={exhaustive}
              setExhaustive={setExhaustive}
              isSubmitting={isSubmitting}
              submitMessage={submitMessage}
              onSubmit={handleSubmit}
            />
          ) : (
            <div style={{ width: "100%" }}>
              <CrawlJobHistory
                jobs={jobs}
                jobsLoading={jobsLoading}
                actioningJobId={actioningJobId}
                onJobAction={handleJobAction}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
