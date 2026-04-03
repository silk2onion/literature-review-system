import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE_URL } from "./api/config";
import {
  Search,
  BookOpen,
  PenTool,
  Settings,
  Sidebar,
  Filter,
  Database,
  Archive,
  Smile,
  FileEdit,
  Activity,
  FileText,
  GitBranch,
  BarChart3,
} from "lucide-react";
import LibraryPage from "./pages/LibraryPage";
import StagingPapersPage from "./pages/StagingPapersPage";
import ReviewGenerateFromLibraryPage from "./pages/ReviewGenerateFromLibraryPage";
import RagDebugPage from "./pages/RagDebugPage";
import AgentChatPanel, { AgentToggleButton } from "./AgentChatPanel";
import SettingsModal from "./pages/SettingsModal";
import "./App.css";
import CrawlerSearchPage from "./pages/CrawlerSearchPage";
import ReviewOrchestratePage from "./pages/ReviewOrchestratePage";
import MonitoringDashboard from "./pages/MonitoringDashboard";
import ReviewListPage from "./pages/ReviewListPage";
import PrismaFlowPage from "./pages/PrismaFlowPage";
import ApiUsagePage from "./pages/ApiUsagePage";

type TabName =
  | "search"
  | "library"
  | "staging"
  | "screening"
  | "rag"
  | "draft"
  | "orchestrate"
  | "monitoring"
  | "apiUsage"
  | "reviews";

/** A4: 全局爬取状态 */
interface CrawlStatusInfo {
  id: number;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  keywords: string[];
  sources: string[];
  fetched_count: number;
  max_results: number;
  progress_percent: number;
  created_at: string;
  updated_at: string;
}

function App() {
  // State
  const [activeTab, setActiveTab] = useState<TabName>("search");
  /** A3: 跨页面参数 —— 切换到 library 时预设 groupId */
  const [libraryInitGroupId, setLibraryInitGroupId] = useState<
    number | undefined
  >(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);

  /** A4: 全局爬取状态 */
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatusInfo | null>(null);

  /** Kaomoji easter egg */
  const [kaomojiMode, setKaomojiMode] = useState(false);
  const kaomojiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const KAOMOJI_FACES = [
    "(╯°□°)╯︵ ┻━┻", "┬─┬ノ( º _ ºノ)", "(ノಠ益ಠ)ノ彡┻━┻",
    "( ˘▽˘)っ♨", "(っ˘ω˘ς)", "ʕ•ᴥ•ʔ", "(❁´◡`❁)",
    "( ˶ˆᗜˆ˵ )", "(*≧ω≦)", "(≧▽≦)", "( ˃̣̣̥᷄⌓˂̣̣̥᷅ )",
    "ᕦ(ò_óˇ)ᕤ", "(ง •_•)ง", "( •̀ ω •́ )✧", "٩(◕‿◕｡)۶",
    "( ͡° ͜ʖ ͡°)", "¯\\_(ツ)_/¯", "(╥_╥)", "( ˊ̱˂˃ˋ̱ )",
    "(*ˊᗜˋ*)/ᵗʰᵃᵑᵏˢ", "( ´ ▽ ` )ﾉ", "(๑˃ᴗ˂)ﻭ",
  ];
  const triggerKaomoji = () => {
    if (kaomojiMode) return;
    setKaomojiMode(true);
    if (kaomojiTimerRef.current) clearTimeout(kaomojiTimerRef.current);
    kaomojiTimerRef.current = setTimeout(() => setKaomojiMode(false), 4000);
  };

  // A4: 轮询最新爬取状态
  const fetchCrawlStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/crawl/jobs/latest_status`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setCrawlStatus(data);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => {
    fetchCrawlStatus();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchCrawlStatus();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchCrawlStatus]);

  /** A3: 导航到文献库并预设分组过滤 — 暴露给 LibraryPage 内的 GroupManager */
  const navigateToLibraryWithGroup = useCallback((groupId: number) => {
    setLibraryInitGroupId(groupId);
    setActiveTab("library");
  }, []);

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case "search":
        return <CrawlerSearchPage />;
      case "library":
        return (
          <LibraryPage
            initialGroupId={libraryInitGroupId}
            onNavigateToLibraryWithGroup={navigateToLibraryWithGroup}
          />
        );
      case "staging":
        // Staging uses the same page but conceptually is the "Staging Library"
        return <StagingPapersPage />;
      case "rag":
        return <RagDebugPage />;
      case "draft":
        return <ReviewGenerateFromLibraryPage />;
      case "orchestrate":
        return <ReviewOrchestratePage />;
      case "screening":
        return <PrismaFlowPage />;
      case "apiUsage":
        return <ApiUsagePage />;
      case "monitoring":
        return <MonitoringDashboard />;
      case "reviews":
        return <ReviewListPage />;
      default:
        return <StagingPapersPage />;
    }
  };

  const _getPageTitle = () => {
    switch (activeTab) {
      case "search":
        return "文献检索";
      case "library":
        return "All References";
      case "staging":
        return "Staging Library";
      case "rag":
        return "RAG Debug";
      case "draft":
        return "Agent Survey Draft";
      case "orchestrate":
        return "一键综述生成";
      case "screening":
        return "PRISMA 筛选流程";
      case "apiUsage":
        return "API 使用监控";
      case "monitoring":
        return "任务进度监控";
      case "reviews":
        return "文献综述书架";
      default:
        return "ScholarNative";
    }
  };

  return (
    <div className="app-container">
      {/* 1. Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        {/* Window Controls (Mac Style) */}
        <div className="window-controls">
          <div className="window-control red"></div>
          <div className="window-control yellow"></div>
          <div className="window-control green"></div>
        </div>

        <div className={`sidebar-content ${kaomojiMode ? "kaomoji-party" : ""}`}>
          {/* Group 1: Discover */}
          <div className="sidebar-group">
            <h3 className="sidebar-group-title">Discover</h3>
            <button
              onClick={() => setActiveTab("search")}
              className={`sidebar-item ${activeTab === "search" ? "active" : ""}`}
            >
              <Search size={16} className="sidebar-icon blue" />
              文献检索
            </button>
            <button
              onClick={() => setActiveTab("monitoring")}
              className={`sidebar-item ${activeTab === "monitoring" ? "active" : ""}`}
            >
              <Activity size={16} className="sidebar-icon green" />
              任务监控
            </button>
            <button
              onClick={() => setActiveTab("apiUsage")}
              className={`sidebar-item ${activeTab === "apiUsage" ? "active" : ""}`}
            >
              <BarChart3 size={16} className="sidebar-icon orange" />
              API 监控
            </button>
            <button
              onClick={() => setActiveTab("screening")}
              className={`sidebar-item ${activeTab === "screening" ? "active" : ""}`}
            >
              <GitBranch size={16} className="sidebar-icon blue" />
              PRISMA 筛选
            </button>
          </div>

          {/* Group 2: Library */}
          <div className="sidebar-group">
            <h3 className="sidebar-group-title">Library</h3>
            <button
              onClick={() => setActiveTab("library")}
              className={`sidebar-item ${activeTab === "library" ? "active" : ""}`}
            >
              <BookOpen size={16} className="sidebar-icon orange" />
              All References
            </button>

            {/* Favorites -> Staging (暂存库) */}
            <button
              onClick={() => setActiveTab("staging")}
              className={`sidebar-item ${activeTab === "staging" ? "active" : ""}`}
            >
              <Archive size={16} className="sidebar-icon" />
              暂存库
            </button>

            {/* Kaomoji Easter Egg */}
            <button
              className="sidebar-item"
              onClick={triggerKaomoji}
              style={{
                cursor: "pointer",
                opacity: kaomojiMode ? 1 : 0.6,
                transition: "all 0.3s",
                animation: kaomojiMode ? "kaomojiWiggle 0.4s ease infinite" : "none",
                background: kaomojiMode ? "rgba(99,102,241,0.08)" : "transparent",
              }}
              title="?"
            >
              <Smile
                size={16}
                className="sidebar-icon"
                style={{
                  animation: kaomojiMode ? "kaomojiSpin 0.6s ease infinite" : "none",
                  color: kaomojiMode ? "#6366f1" : undefined,
                }}
              />
              {kaomojiMode
                ? KAOMOJI_FACES[Math.floor(Math.random() * KAOMOJI_FACES.length)]
                : "(｡•̀ᴗ-)✧"}
            </button>

            {/* RAG Debug under Recent */}
            <button
              onClick={() => setActiveTab("rag")}
              className={`sidebar-item ${activeTab === "rag" ? "active" : ""}`}
            >
              <Database size={16} className="sidebar-icon purple" />
              RAG Debug
            </button>
          </div>

          {/* Group 3: Projects */}
          <div className="sidebar-group">
            <h3 className="sidebar-group-title">Projects</h3>
            <button
              onClick={() => setActiveTab("draft")}
              className={`sidebar-item ${activeTab === "draft" ? "active" : ""}`}
            >
              <PenTool size={16} className="sidebar-icon purple" />
              Agent Survey Draft
            </button>
            <button
              onClick={() => setActiveTab("orchestrate")}
              className={`sidebar-item ${activeTab === "orchestrate" ? "active" : ""}`}
            >
              <FileEdit size={16} className="sidebar-icon green" />
              一键综述生成
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`sidebar-item ${activeTab === "reviews" ? "active" : ""}`}
            >
              <FileText size={16} className="sidebar-icon purple" />
              文献综述
            </button>
          </div>
        </div>

        {/* Bottom Settings */}
        <div className="sidebar-footer">
          <button
            className="sidebar-item"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={16} className="sidebar-icon" />
            Settings
          </button>
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="main-content">
        {/* Top Toolbar */}
        <div className="top-toolbar">
          <div className="toolbar-left">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="icon-button"
              title="Toggle Sidebar"
            >
              <Sidebar size={18} />
            </button>
          </div>

          <div className="toolbar-right">
            {/* A4: 全局爬取状态指示器 */}
            {crawlStatus &&
              (crawlStatus.status === "running" ||
                crawlStatus.status === "pending") && (
                <button
                  onClick={() => setActiveTab("monitoring")}
                  title="点击查看任务详情"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    background: "rgba(59, 130, 246, 0.08)",
                    color: "#3b82f6",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor:
                        crawlStatus.status === "running"
                          ? "#3b82f6"
                          : "#f59e0b",
                    }}
                  />
                  <span>
                    {crawlStatus.status === "running" ? "爬取中" : "等待中"}{" "}
                    {crawlStatus.fetched_count}/{crawlStatus.max_results}
                  </span>
                  <span style={{ color: "#94a3b8" }}>
                    {crawlStatus.progress_percent}%
                  </span>
                </button>
              )}
            {activeTab === "search" && (
              <button className="icon-button" title="Filter">
                <Filter size={16} />
              </button>
            )}
            <AgentToggleButton
              isOpen={agentOpen}
              onClick={() => setAgentOpen(!agentOpen)}
            />
          </div>
        </div>

        {/* Page Content */}
        <div className="page-viewport">{renderContent()}</div>
      </div>

      {/* Agent Chat Panel */}
      <AgentChatPanel
        isOpen={agentOpen}
        onClose={() => setAgentOpen(false)}
        onNavigate={(tab) => {
          setActiveTab(tab);
          setAgentOpen(false);
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

export default App;
