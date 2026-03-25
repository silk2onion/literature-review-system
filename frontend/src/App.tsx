import { useState } from "react";
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
import LibraryPage from "./LibraryPage";
import StagingPapersPage from "./StagingPapersPage";
import ReviewGenerateFromLibraryPage from "./ReviewGenerateFromLibraryPage";
import RagDebugPage from "./RagDebugPage";
import AgentChatPanel, { AgentToggleButton } from "./AgentChatPanel";
import SettingsModal from "./SettingsModal";
import "./App.css";
import CrawlerSearchPage from "./CrawlerSearchPage";
import ReviewOrchestratePage from "./ReviewOrchestratePage";
import MonitoringDashboard from "./MonitoringDashboard";
import ReviewListPage from "./ReviewListPage";
import PrismaFlowPage from "./PrismaFlowPage";
import ApiUsagePage from "./ApiUsagePage";

function App() {
  // State
  const [activeTab, setActiveTab] = useState<
    | "search"
    | "library"
    | "staging"
    | "screening"
    | "rag"
    | "draft"
    | "orchestrate"
    | "monitoring"
    | "apiUsage"
    | "reviews"
  >("search");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case "search":
        return <CrawlerSearchPage />;
      case "library":
        return <LibraryPage />;
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

  const getPageTitle = () => {
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

        <div className="sidebar-content">
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

            {/* Recent -> Kaomoji */}
            <div
              className="sidebar-item"
              style={{ cursor: "default", opacity: 0.6 }}
            >
              <Smile size={16} className="sidebar-icon" />
              (｡•̀ᴗ-)✧
            </div>

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
            <span className="toolbar-title">{getPageTitle()}</span>
          </div>

          <div className="toolbar-right">
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
