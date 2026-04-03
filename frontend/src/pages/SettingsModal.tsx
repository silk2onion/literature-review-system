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
import { useLocale } from "../hooks/useLocale";
import type { TranslationKey } from "../locales";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const tabs = [
  { key: "data-sources", labelKey: "settings.tab.dataSources", icon: "🔌" },
  { key: "models", labelKey: "settings.tab.modelSelection", icon: "🤖" },
  { key: "llm-connection", labelKey: "settings.tab.llmConnection", icon: "🔗" },
  { key: "system-prompt", labelKey: "settings.tab.systemPrompt", icon: "💬" },
  { key: "agent", labelKey: "settings.tab.agentHeartbeat", icon: "💗" },
  { key: "review-defaults", labelKey: "settings.tab.reviewDefaults", icon: "📝" },
  { key: "crawler", labelKey: "settings.tab.crawler", icon: "🕷️" },
  { key: "institutional", labelKey: "settings.tab.institutional", icon: "🏛️" },
  { key: "search", labelKey: "settings.tab.search", icon: "🔍" },
  { key: "discipline", labelKey: "settings.tab.discipline", icon: "🎓" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("data-sources");
  const { t, locale, setLocale } = useLocale();

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
              <span>{t(tab.labelKey as TranslationKey)}</span>
            </button>
          ))}
        </nav>

        {/* Main content area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div className="settings-header">
            <h2>{t("settings.title")}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Language toggle */}
              <div
                style={{
                  display: "flex",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid #475569",
                  fontSize: 12,
                }}
              >
                <button
                  onClick={() => setLocale("zh-CN")}
                  style={{
                    padding: "3px 10px",
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: locale === "zh-CN" ? "#3b82f6" : "transparent",
                    color: locale === "zh-CN" ? "#fff" : "#94a3b8",
                    fontWeight: locale === "zh-CN" ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  中文
                </button>
                <button
                  onClick={() => setLocale("en")}
                  style={{
                    padding: "3px 10px",
                    border: "none",
                    borderLeft: "1px solid #475569",
                    cursor: "pointer",
                    backgroundColor: locale === "en" ? "#3b82f6" : "transparent",
                    color: locale === "en" ? "#fff" : "#94a3b8",
                    fontWeight: locale === "en" ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  EN
                </button>
              </div>
              <button className="settings-close" onClick={onClose}>
                ×
              </button>
            </div>
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
