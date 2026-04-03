import { useState } from "react";
import DataSourcesSettings from "../components/settings/DataSourcesSettings";
import ModelSelectionSettings from "../components/settings/ModelSelectionSettings";
import LLMConnectionSettings from "../components/settings/LLMConnectionSettings";
import SystemPromptSettings from "../components/settings/SystemPromptSettings";
import AgentSettings from "../components/settings/AgentSettings";
import ReviewDefaultsSettings from "../components/settings/ReviewDefaultsSettings";
import CrawlerSettings from "../components/settings/CrawlerSettings";
import SearchSettings from "../components/settings/SearchSettings";
import DisciplineProfileSettings from "../components/settings/DisciplineProfileSettings";
import InstitutionalAccessSettings from "../components/settings/InstitutionalAccessSettings";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const tabs = [
  { key: "data-sources", label: "数据源", icon: "🔌" },
  { key: "models", label: "模型选择", icon: "🤖" },
  { key: "llm-connection", label: "LLM 连接", icon: "🔗" },
  { key: "system-prompt", label: "系统提示词", icon: "💬" },
  { key: "agent", label: "Agent 心跳", icon: "💗" },
  { key: "review-defaults", label: "综述默认值", icon: "📝" },
  { key: "crawler", label: "爬虫配置", icon: "🕷️" },
  { key: "institutional", label: "机构访问", icon: "🏛️" },
  { key: "search", label: "语义检索", icon: "🔍" },
  { key: "discipline", label: "学科配置", icon: "🎓" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("data-sources");

  if (!open) return null;

  const renderContent = () => {
    switch (activeTab) {
      case "data-sources":
        return <DataSourcesSettings open={open} />;
      case "models":
        return <ModelSelectionSettings open={open} />;
      case "llm-connection":
        return <LLMConnectionSettings open={open} />;
      case "system-prompt":
        return <SystemPromptSettings open={open} />;
      case "agent":
        return <AgentSettings open={open} />;
      case "review-defaults":
        return <ReviewDefaultsSettings open={open} />;
      case "crawler":
        return <CrawlerSettings open={open} />;
      case "institutional":
        return <InstitutionalAccessSettings open={open} />;
      case "search":
        return <SearchSettings open={open} />;
      case "discipline":
        return <DisciplineProfileSettings open={open} />;
    }
  };

  return (
    <div className="settings-backdrop">
      <div className="settings-modal" style={{ display: "flex", flexDirection: "row" }}>
        {/* Tab sidebar */}
        <nav
          style={{
            width: "180px",
            minWidth: "180px",
            borderRight: "1px solid #334155",
            display: "flex",
            flexDirection: "column",
            padding: "16px 0",
            gap: "2px",
            overflowY: "auto",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                border: "none",
                background:
                  activeTab === tab.key
                    ? "rgba(96, 165, 250, 0.15)"
                    : "transparent",
                color: activeTab === tab.key ? "#60a5fa" : "#94a3b8",
                fontSize: "13px",
                cursor: "pointer",
                textAlign: "left",
                borderLeft:
                  activeTab === tab.key
                    ? "3px solid #60a5fa"
                    : "3px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Main content area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div className="settings-header">
            <h2>系统设置</h2>
            <button className="settings-close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="settings-body" style={{ flex: 1, overflowY: "auto" }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
