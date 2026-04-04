import { Play, Pause, RotateCcw, ScanSearch } from "lucide-react";
import type { CrawlJob } from "../../types";
import { useLocale } from "../../hooks/useLocale";

interface CrawlJobRowProps {
  job: CrawlJob;
  actioningJobId: number | null;
  onJobAction: (
    jobId: number,
    action: "run_once" | "pause" | "resume" | "retry",
  ) => void;
  statusLabel: string;
  statusStyle: { color: string; backgroundColor: string };
}

export default function CrawlJobRow({
  job,
  actioningJobId,
  onJobAction,
  statusLabel,
  statusStyle,
}: CrawlJobRowProps) {
  const { t } = useLocale();
  return (
    <tr style={{ borderTop: "1px solid #f3f4f6" }}>
      <td style={{ padding: "16px 24px", color: "#6b7280" }}>
        #{job.id}
      </td>
      <td
        style={{
          padding: "16px 24px",
          color: "#111827",
          fontWeight: 500,
        }}
      >
        {job.keywords.join(", ")}
        <div
          style={{
            fontSize: "12px",
            color: "#9ca3af",
            marginTop: "4px",
            fontWeight: 400,
          }}
        >
          {job.sources.join(", ")} •{" "}
          {new Date(job.created_at).toLocaleDateString()}
        </div>
      </td>
      <td style={{ padding: "16px 24px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 10px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: 500,
            ...statusStyle,
          }}
        >
          {statusLabel}
        </span>
      </td>
      <td
        style={{
          padding: "16px 24px",
          textAlign: "right",
          color: "#4b5563",
        }}
      >
        {job.exhaustive ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {job.fetched_count}{" "}
            <ScanSearch
              size={14}
              style={{ color: "#7c3aed" }}
            />
          </span>
        ) : (
          `${job.fetched_count} / ${job.max_results}`
        )}
      </td>
      <td
        style={{ padding: "16px 24px", textAlign: "right" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          {(job.status === "pending" ||
            job.status === "running") && (
            <>
              <button
                onClick={() =>
                  onJobAction(job.id, "run_once")
                }
                disabled={actioningJobId === job.id}
                style={{
                  padding: "6px",
                  color: "#2563eb",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                title={t("crawl.history.runOnce")}
              >
                <Play size={16} />
              </button>
              <button
                onClick={() =>
                  onJobAction(job.id, "pause")
                }
                disabled={actioningJobId === job.id}
                style={{
                  padding: "6px",
                  color: "#ca8a04",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                title={t("crawl.history.pause")}
              >
                <Pause size={16} />
              </button>
            </>
          )}
          {job.status === "paused" && (
            <button
              onClick={() =>
                onJobAction(job.id, "resume")
              }
              disabled={actioningJobId === job.id}
              style={{
                padding: "6px",
                color: "#16a34a",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              title={t("crawl.history.resume")}
            >
              <Play size={16} />
            </button>
          )}
          {(job.status === "failed" ||
            job.status === "completed") && (
            <button
              onClick={() => onJobAction(job.id, "retry")}
              disabled={actioningJobId === job.id}
              style={{
                padding: "6px",
                color: "#4b5563",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              title={t("crawl.history.retry")}
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
