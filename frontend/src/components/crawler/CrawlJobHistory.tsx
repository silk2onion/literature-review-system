import { List, Loader } from "lucide-react";
import type { CrawlJob, JobStatusCode } from "../../types";
import CrawlJobRow from "./CrawlJobRow";

const STATUS_LABELS: Record<JobStatusCode, string> = {
  pending: "等待中",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  paused: "已暂停",
};

// Helper for status colors
const getStatusStyle = (status: JobStatusCode) => {
  switch (status) {
    case "pending":
      return { color: "#6b7280", backgroundColor: "#f3f4f6" };
    case "running":
      return { color: "#3b82f6", backgroundColor: "#eff6ff" };
    case "completed":
      return { color: "#22c55e", backgroundColor: "#f0fdf4" };
    case "failed":
      return { color: "#ef4444", backgroundColor: "#fef2f2" };
    case "paused":
      return { color: "#eab308", backgroundColor: "#fefce8" };
    default:
      return { color: "#6b7280", backgroundColor: "#f3f4f6" };
  }
};

interface CrawlJobHistoryProps {
  jobs: CrawlJob[];
  jobsLoading: boolean;
  actioningJobId: number | null;
  onJobAction: (
    jobId: number,
    action: "run_once" | "pause" | "resume" | "retry",
  ) => void;
}

export { STATUS_LABELS, getStatusStyle };

export default function CrawlJobHistory({
  jobs,
  jobsLoading,
  actioningJobId,
  onJobAction,
}: CrawlJobHistoryProps) {
  if (jobsLoading && jobs.length === 0) {
    return (
      <div
        style={{
          padding: "48px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: "#9ca3af",
        }}
      >
        <Loader size={32} style={{ marginBottom: "16px" }} />
        <p>加载任务中...</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div
        style={{
          padding: "48px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: "#9ca3af",
        }}
      >
        <List
          size={48}
          style={{ marginBottom: "16px", opacity: 0.2 }}
        />
        <p>暂无历史任务</p>
      </div>
    );
  }

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "14px",
      }}
    >
      <thead
        style={{
          backgroundColor: "#f9fafb",
          color: "#6b7280",
          textAlign: "left",
        }}
      >
        <tr>
          <th style={{ padding: "12px 24px", fontWeight: 500 }}>
            ID
          </th>
          <th style={{ padding: "12px 24px", fontWeight: 500 }}>
            关键词
          </th>
          <th style={{ padding: "12px 24px", fontWeight: 500 }}>
            状态
          </th>
          <th
            style={{
              padding: "12px 24px",
              fontWeight: 500,
              textAlign: "right",
            }}
          >
            进度
          </th>
          <th
            style={{
              padding: "12px 24px",
              fontWeight: 500,
              textAlign: "right",
            }}
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <CrawlJobRow
            key={job.id}
            job={job}
            actioningJobId={actioningJobId}
            onJobAction={onJobAction}
            statusLabel={STATUS_LABELS[job.status] || job.status}
            statusStyle={getStatusStyle(job.status)}
          />
        ))}
      </tbody>
    </table>
  );
}
