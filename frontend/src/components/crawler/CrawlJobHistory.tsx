import { List, Loader } from "lucide-react";
import type { CrawlJob, JobStatusCode } from "../../types";
import CrawlJobRow from "./CrawlJobRow";
import { useLocale } from "../../hooks/useLocale";

const STATUS_LABEL_KEYS: Record<JobStatusCode, string> = {
  pending: "crawl.history.pending",
  running: "crawl.history.running",
  completed: "crawl.history.completed",
  failed: "crawl.history.failed",
  paused: "crawl.history.paused",
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

export { STATUS_LABEL_KEYS, getStatusStyle };

export default function CrawlJobHistory({
  jobs,
  jobsLoading,
  actioningJobId,
  onJobAction,
}: CrawlJobHistoryProps) {
  const { t } = useLocale();

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
        <p>{t("crawl.history.loading")}</p>
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
        <p>{t("crawl.history.empty")}</p>
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
            {t("crawl.history.keywords")}
          </th>
          <th style={{ padding: "12px 24px", fontWeight: 500 }}>
            {t("crawl.history.status")}
          </th>
          <th
            style={{
              padding: "12px 24px",
              fontWeight: 500,
              textAlign: "right",
            }}
          >
            {t("crawl.history.progress")}
          </th>
          <th
            style={{
              padding: "12px 24px",
              fontWeight: 500,
              textAlign: "right",
            }}
          >
            {t("crawl.history.actions")}
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
            statusLabel={t(STATUS_LABEL_KEYS[job.status] as any) || job.status}
            statusStyle={getStatusStyle(job.status)}
          />
        ))}
      </tbody>
    </table>
  );
}
