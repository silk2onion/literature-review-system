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
            width: 200,
            minWidth: 200,
            borderRight: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            padding: "20px 0",
            gap: 2,
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
                gap: 10,
                padding: "11px 20px",
                border: "none",
                background:
                  activeTab === tab.key
                    ? "rgba(96, 165, 250, 0.12)"
                    : "transparent",
                color: activeTab === tab.key ? "#3b82f6" : "#64748b",
                fontSize: 13,
                fontWeight: activeTab === tab.key ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
                borderLeft:
                  activeTab === tab.key
                    ? "3px solid #3b82f6"
                    : "3px solid transparent",
                transition: "all 0.15s ease",
                borderRadius: 0,
              }}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              <span>{t(tab.labelKey as TranslationKey)}</span>
            </button>
          ))}

          {/* Language toggle at bottom of sidebar */}
          <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid var(--border-color)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                borderRadius: 8,
                backgroundColor: "rgba(0, 0, 0, 0.04)",
                padding: 3,
              }}
            >
              <button
                onClick={() => setLocale("zh-CN")}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: locale === "zh-CN" ? "#fff" : "transparent",
                  color: locale === "zh-CN" ? "#1e293b" : "#94a3b8",
                  boxShadow: locale === "zh-CN" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                中文
              </button>
              <button
                onClick={() => setLocale("en")}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: locale === "en" ? "#fff" : "transparent",
                  color: locale === "en" ? "#1e293b" : "#94a3b8",
                  boxShadow: locale === "en" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                English
              </button>
            </div>
          </div>
        </nav>

        {/* Main content area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div className="settings-header">
            <h2>{t("settings.title")}</h2>
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
