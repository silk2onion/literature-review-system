import { Zap, ExternalLink } from "lucide-react";
import { useLocale } from "../../hooks/useLocale";

export type ActionResult = {
  tool: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
};

const TOOL_LABELS: Record<
  string,
  { labelKey: string; emoji: string; color: string }
> = {
  search_papers: { labelKey: "agent.tool.searchPapers", emoji: "🔍", color: "#3b82f6" },
  list_staging: { labelKey: "agent.tool.listStaging", emoji: "📋", color: "#8b5cf6" },
  promote_papers: { labelKey: "agent.tool.promotePapers", emoji: "⬆️", color: "#22c55e" },
  delete_staging: { labelKey: "agent.tool.deleteStaging", emoji: "🗑️", color: "#ef4444" },
  search_library: { labelKey: "agent.tool.searchLibrary", emoji: "📚", color: "#f59e0b" },
  sync_citations: { labelKey: "agent.tool.syncCitations", emoji: "🔗", color: "#06b6d4" },
  system_status: { labelKey: "agent.tool.systemStatus", emoji: "⚙️", color: "#64748b" },
  general_chat: { labelKey: "agent.tool.chat", emoji: "💬", color: "#6366f1" },
  generate_framework: { labelKey: "agent.tool.generateFramework", emoji: "📝", color: "#8b5cf6" },
  start_review_task: { labelKey: "agent.tool.startReviewTask", emoji: "🚀", color: "#ec4899" },
  run_phd_pipeline: { labelKey: "agent.tool.runPhdPipeline", emoji: "🔬", color: "#14b8a6" },
  list_reviews: { labelKey: "agent.tool.listReviews", emoji: "📄", color: "#f59e0b" },
  export_review: { labelKey: "agent.tool.exportReview", emoji: "📥", color: "#22c55e" },
  semantic_search: { labelKey: "agent.tool.semanticSearch", emoji: "🧠", color: "#a855f7" },
  manage_groups: { labelKey: "agent.tool.manageGroups", emoji: "📁", color: "#64748b" },
  check_task_progress: { labelKey: "agent.tool.checkProgress", emoji: "📊", color: "#f59e0b" },
  modify_task_requirements: { labelKey: "agent.tool.modifyRequirements", emoji: "✏️", color: "#f97316" },
  configure_discipline: { labelKey: "agent.tool.configureDiscipline", emoji: "🎓", color: "#8b5cf6" },
  download_pdf: { labelKey: "agent.tool.downloadPdf", emoji: "📥", color: "#10b981" },
  screen_papers: { labelKey: "agent.tool.screenPapers", emoji: "🔬", color: "#ec4899" },
  enrich_papers: { labelKey: "agent.tool.enrichPapers", emoji: "✨", color: "#f59e0b" },
  prisma_stage: { labelKey: "agent.tool.prismaStage", emoji: "📋", color: "#06b6d4" },
  institutional_login: { labelKey: "agent.tool.institutionalLogin", emoji: "🏛️", color: "#8b5cf6" },
};

const cardStyles = {
  badge: {
    padding: "2px 8px",
    borderRadius: 12,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    color: "#4f46e5",
    fontSize: 11,
    fontWeight: 500 as const,
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 12,
    backgroundColor: "#6366f1",
    color: "white",
    fontSize: 11,
    fontWeight: 500 as const,
    border: "none",
    cursor: "pointer",
  },
};

export default function ToolActionCard({ action }: { action: ActionResult }) {
  const { t } = useLocale();

  const toolInfo = TOOL_LABELS[action.tool] || {
    labelKey: "",
    emoji: "⚡",
    color: "#64748b",
  };

  const label = toolInfo.labelKey ? t(toolInfo.labelKey) : action.tool;

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${toolInfo.color}22`,
        backgroundColor: `${toolInfo.color}08`,
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <Zap size={14} style={{ color: toolInfo.color }} />
        <span style={{ fontWeight: 600, color: toolInfo.color, fontSize: 12 }}>
          {toolInfo.emoji} {label}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        {action.result.error ? (
          <span style={{ color: "#ef4444" }}>
            ❌ {action.result.error as string}
          </span>
        ) : (
          <>
            {typeof action.result.total === "number" && (
              <span style={cardStyles.badge}>{t("agent.resultCount", { count: action.result.total })}</span>
            )}
            {(action.result.task_id ||
              action.result.id ||
              action.result.job_id) && (
              <>
                <span style={cardStyles.badge}>
                  🚀 ID:{" "}
                  {String(
                    action.result.task_id ||
                      action.result.id ||
                      action.result.job_id,
                  )}
                </span>
                <button
                  onClick={() => {
                    const nav = (window as any).onAgentNavigate;
                    if (nav) nav("monitoring");
                  }}
                  style={cardStyles.actionBtn}
                >
                  {t("agent.goToMonitoring")} <ExternalLink size={10} />
                </button>
              </>
            )}
            {/* Fallback for other results */}
            {!action.result.task_id && !action.result.error && (
              <span style={{ color: toolInfo.color }}>{t("agent.operationSuccess")}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
