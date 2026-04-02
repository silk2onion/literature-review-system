import React from "react";
import {
  Zap,
  XCircle,
  Clock,
  ArrowUpDown,
  Database,
  Brain,
  Globe,
} from "lucide-react";

/* ───────── Types ───────── */
export interface UsageStats {
  total_calls: number;
  total_errors: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_duration_ms: number;
  by_type: Record<string, number>;
  by_source: Record<string, number>;
  by_model: Record<string, number>;
  error_rate: number;
  avg_duration_ms: number;
}

/* ───────── Helpers ───────── */
export const typeColors: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode }
> = {
  llm: {
    bg: "rgba(168, 85, 247, 0.15)",
    text: "#c084fc",
    icon: <Brain size={12} />,
  },
  embedding: {
    bg: "rgba(59, 130, 246, 0.15)",
    text: "#60a5fa",
    icon: <Database size={12} />,
  },
  crawler: {
    bg: "rgba(34, 197, 94, 0.15)",
    text: "#4ade80",
    icon: <Globe size={12} />,
  },
};

export function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getDurationColor(ms: number | null): string {
  if (ms == null) return "#64748b";
  if (ms < 1000) return "#10b981";
  if (ms < 5000) return "#f59e0b";
  return "#f43f5e";
}

/* ───────── StatCard ───────── */
function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div style={panelStyles.statCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: `${color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#e2e8f0",
              fontFamily: "monospace",
            }}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Panel Component ───────── */
interface UsageStatsPanelProps {
  stats: UsageStats;
}

export default function UsageStatsPanel({ stats }: UsageStatsPanelProps) {
  return (
    <div style={panelStyles.statsGrid}>
      <StatCard
        label="总调用"
        value={formatNumber(stats.total_calls)}
        icon={<Zap size={18} color="#6366f1" />}
        color="#6366f1"
      />
      <StatCard
        label="错误率"
        value={`${(stats.error_rate * 100).toFixed(1)}%`}
        icon={
          <XCircle
            size={18}
            color={stats.error_rate > 0.1 ? "#f43f5e" : "#10b981"}
          />
        }
        color={stats.error_rate > 0.1 ? "#f43f5e" : "#10b981"}
      />
      <StatCard
        label="平均延迟"
        value={formatDuration(stats.avg_duration_ms)}
        icon={<Clock size={18} color="#f59e0b" />}
        color="#f59e0b"
      />
      <StatCard
        label="Token 输入"
        value={formatNumber(stats.total_tokens_in)}
        icon={<ArrowUpDown size={18} color="#3b82f6" />}
        color="#3b82f6"
      />
      <StatCard
        label="Token 输出"
        value={formatNumber(stats.total_tokens_out)}
        icon={<ArrowUpDown size={18} color="#8b5cf6" />}
        color="#8b5cf6"
      />

      {/* Type breakdown mini cards */}
      {Object.entries(stats.by_type).map(([type, count]) => {
        const tc = typeColors[type] || {
          bg: "rgba(148,163,184,0.15)",
          text: "#94a3b8",
          icon: null,
        };
        return (
          <StatCard
            key={type}
            label={type.toUpperCase()}
            value={formatNumber(count)}
            icon={tc.icon || <Database size={18} />}
            color={tc.text}
          />
        );
      })}
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderRadius: 10,
    padding: "14px 16px",
    border: "1px solid rgba(148, 163, 184, 0.08)",
  },
};
