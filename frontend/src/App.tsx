import { useState, useEffect } from "react";
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
} from "lucide-react";
import LibraryPage from "./LibraryPage";
import StagingPapersPage from "./StagingPapersPage";
import ReviewGenerateFromLibraryPage from "./ReviewGenerateFromLibraryPage";
import RagDebugPage from "./RagDebugPage";
import "./App.css";
import CrawlerSearchPage from "./CrawlerSearchPage";

const API_BASE_URL = "http://localhost:5444";

function App() {
  // State
  const [activeTab, setActiveTab] = useState<"search" | "library" | "staging" | "rag" | "draft">("search");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Settings State
  const [settingsData, setSettingsData] = useState({
    serpapi_key: "",
    scopus_key: "",
    rag_enabled: false,
    llm_model: "",
    embedding_model: "",
  });
  const [modelOptions, setModelOptions] = useState<{ llm: string[]; embedding: string[] }>({
    llm: [],
    embedding: [],
  });

  // Fetch Settings
  useEffect(() => {
    if (showSettings) {
      fetchSettings();
    }
  }, [showSettings]);

  const fetchSettings = async () => {
    try {
      const [sourcesResp, modelsResp] = await Promise.all([
        fetch(`${API_BASE_URL}/api/settings/data-sources`),
        fetch(`${API_BASE_URL}/api/settings/models`),
      ]);

      const sources = await sourcesResp.json();
      const models = await modelsResp.json();

      setSettingsData({
        serpapi_key: sources.serpapi?.api_key || "",
        scopus_key: sources.scopus?.api_key || "",
        rag_enabled: sources.rag?.enabled || false,
        llm_model: models.current_llm_model || "",
        embedding_model: models.current_embedding_model || "",
      });

      setModelOptions({
        llm: models.llm_models || [],
        embedding: models.embedding_models || [],
      });
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  };

  const saveSettings = async () => {
    try {
      // Save Data Sources
      await fetch(`${API_BASE_URL}/api/settings/data-sources`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serpapi: { enabled: !!settingsData.serpapi_key, api_key: settingsData.serpapi_key },
          scopus: { enabled: !!settingsData.scopus_key, api_key: settingsData.scopus_key },
          rag: { enabled: settingsData.rag_enabled },
        }),
      });

      // Save Models
      await fetch(`${API_BASE_URL}/api/settings/models`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_model: settingsData.llm_model,
          embedding_model: settingsData.embedding_model,
        }),
      });

      setShowSettings(false);
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("保存设置失败");
    }
  };

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
            <div className="sidebar-item" style={{ cursor: "default", opacity: 0.6 }}>
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
          </div>
        </div>

        {/* Page Content */}
        <div className="page-viewport">
          {renderContent()}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-backdrop" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="settings-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="settings-body">
              <div className="settings-section">
                <h3>Data Sources</h3>
                <div className="settings-row">
                  <label>SerpApi Key</label>
                  <input
                    type="password"
                    value={settingsData.serpapi_key}
                    onChange={(e) => setSettingsData({ ...settingsData, serpapi_key: e.target.value })}
                    placeholder="Enter SerpApi Key"
                  />
                </div>
                <div className="settings-row">
                  <label>Scopus Key</label>
                  <input
                    type="password"
                    value={settingsData.scopus_key}
                    onChange={(e) => setSettingsData({ ...settingsData, scopus_key: e.target.value })}
                    placeholder="Enter Scopus Key"
                  />
                </div>
                <div className="settings-row">
                  <label>Enable RAG</label>
                  <input
                    type="checkbox"
                    checked={settingsData.rag_enabled}
                    onChange={(e) => setSettingsData({ ...settingsData, rag_enabled: e.target.checked })}
                  />
                </div>
              </div>

              <div className="settings-section">
                <h3>Models</h3>
                <div className="settings-row">
                  <label>LLM Model</label>
                  <select
                    className="filter-select"
                    value={settingsData.llm_model}
                    onChange={(e) => setSettingsData({ ...settingsData, llm_model: e.target.value })}
                  >
                    {modelOptions.llm.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="settings-row">
                  <label>Embedding Model</label>
                  <select
                    className="filter-select"
                    value={settingsData.embedding_model}
                    onChange={(e) => setSettingsData({ ...settingsData, embedding_model: e.target.value })}
                  >
                    {modelOptions.embedding.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="settings-footer">
              <button className="settings-primary" onClick={saveSettings}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
