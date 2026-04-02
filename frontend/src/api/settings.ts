import { apiGet, apiPut, apiPost, apiDelete } from "./http";
import type {
  DataSourcesConfig,
  ModelOptions,
  AgentConfig,
  LLMConnectionConfig,
  ReviewDefaultsConfig,
  CrawlerConfig,
  SearchConfig,
  DisciplineProfileConfig,
} from "../types/settings";

export const settingsApi = {
  // Data sources
  getDataSources() {
    return apiGet<DataSourcesConfig>("/api/settings/data-sources");
  },
  saveDataSources(config: DataSourcesConfig) {
    return apiPut<DataSourcesConfig>("/api/settings/data-sources", config);
  },

  // Models
  getModels() {
    return apiGet<ModelOptions>("/api/settings/models");
  },
  saveModels(config: { llm_model: string; embedding_model: string }) {
    return apiPut<ModelOptions>("/api/settings/models", config);
  },

  // LLM connection
  getLLMConnection() {
    return apiGet<LLMConnectionConfig>("/api/settings/llm-connection");
  },
  saveLLMConnection(config: LLMConnectionConfig) {
    return apiPut<LLMConnectionConfig>("/api/settings/llm-connection", config);
  },

  // System prompt
  getSystemPrompt() {
    return apiGet<{ content: string }>("/api/settings/system-prompt");
  },
  saveSystemPrompt(content: string) {
    return apiPut<{ content: string }>("/api/settings/system-prompt", { content });
  },

  // Agent
  getAgent() {
    return apiGet<AgentConfig>("/api/settings/agent");
  },
  saveAgent(config: AgentConfig) {
    return apiPut<AgentConfig>("/api/settings/agent", config);
  },

  // Review defaults
  getReviewDefaults() {
    return apiGet<ReviewDefaultsConfig>("/api/settings/review-defaults");
  },
  saveReviewDefaults(config: ReviewDefaultsConfig) {
    return apiPut<ReviewDefaultsConfig>("/api/settings/review-defaults", config);
  },

  // Crawler
  getCrawler() {
    return apiGet<CrawlerConfig>("/api/settings/crawler");
  },
  saveCrawler(config: CrawlerConfig) {
    return apiPut<CrawlerConfig>("/api/settings/crawler", config);
  },

  // Search
  getSearch() {
    return apiGet<SearchConfig>("/api/settings/search");
  },
  saveSearch(config: SearchConfig) {
    return apiPut<SearchConfig>("/api/settings/search", config);
  },

  // Discipline profile
  getDisciplineProfile() {
    return apiGet<DisciplineProfileConfig>("/api/settings/discipline-profile");
  },
  saveDisciplineProfile(config: DisciplineProfileConfig) {
    return apiPut<DisciplineProfileConfig>("/api/settings/discipline-profile", config);
  },

  // Discipline presets
  getDisciplinePresets() {
    return apiGet<{ presets: { name: string; field_name: string }[] }>(
      "/api/settings/discipline-presets",
    );
  },
  loadDisciplinePreset(name: string) {
    return apiPost<{ success: boolean; message: string; profile: DisciplineProfileConfig }>(
      `/api/settings/discipline-presets/${encodeURIComponent(name)}/load`,
    );
  },
  saveDisciplinePreset(name: string, profile: DisciplineProfileConfig) {
    return apiPost<Record<string, unknown>>("/api/settings/discipline-presets", {
      name,
      profile,
    });
  },
  deleteDisciplinePreset(name: string) {
    return apiDelete<Record<string, unknown>>(
      `/api/settings/discipline-presets/${encodeURIComponent(name)}`,
    );
  },
};
