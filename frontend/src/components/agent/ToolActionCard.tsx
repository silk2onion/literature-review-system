import { Zap, ExternalLink } from "lucide-react";

export type ActionResult = {
  tool: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
};

const TOOL_LABELS: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  search_papers: { label: "搜索文献", emoji: "🔍", color: "#3b82f6" },
  list_staging: { label: "查看暂存库", emoji: "📋", color: "#8b5cf6" },
  promote_papers: { label: "提升文献", emoji: "⬆️", color: "#22c55e" },
  delete_staging: { label: "删除暂存", emoji: "🗑️", color: "#ef4444" },
  search_library: { label: "搜索正式库", emoji: "📚", color: "#f59e0b" },
  sync_citations: { label: "同步引用", emoji: "🔗", color: "#06b6d4" },
  system_status: { label: "系统状态", emoji: "⚙️", color: "#64748b" },
  general_chat: { label: "对话", emoji: "💬", color: "#6366f1" },
  generate_framework: { label: "生成框架", emoji: "📝", color: "#8b5cf6" },
  start_review_task: { label: "异步生成综述", emoji: "🚀", color: "#ec4899" },
  run_phd_pipeline: { label: "运行管线", emoji: "🔬", color: "#14b8a6" },
  list_reviews: { label: "查看综述", emoji: "📄", color: "#f59e0b" },
  export_review: { label: "导出综述", emoji: "📥", color: "#22c55e" },
  semantic_search: { label: "语义搜索", emoji: "🧠", color: "#a855f7" },
  manage_groups: { label: "管理分组", emoji: "📁", color: "#64748b" },
  check_task_progress: { label: "查看进度", emoji: "📊", color: "#f59e0b" },
  modify_task_requirements: { label: "修改需求", emoji: "✏️", color: "#f97316" },
  configure_discipline: { label: "学科配置", emoji: "🎓", color: "#8b5cf6" },
  download_pdf: { label: "下载 PDF", emoji: "📥", color: "#10b981" },
  screen_papers: { label: "AI 筛选", emoji: "🔬", color: "#ec4899" },
  enrich_papers: { label: "元数据补全", emoji: "✨", color: "#f59e0b" },
  prisma_stage: { label: "PRISMA 筛选", emoji: "📋", color: "#06b6d4" },
  institutional_login: { label: "机构登录", emoji: "🏛️", color: "#8b5cf6" },
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
  const toolInfo = TOOL_LABELS[action.tool] || {
    label: action.tool,
    emoji: "⚡",
    color: "#64748b",
  };

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
          {toolInfo.emoji} {toolInfo.label}
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
              <span style={cardStyles.badge}>{action.result.total} 条</span>
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
                  前往监控面板 <ExternalLink size={10} />
                </button>
              </>
            )}
            {/* Fallback for other results */}
            {!action.result.task_id && !action.result.error && (
              <span style={{ color: toolInfo.color }}>操作成功</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
