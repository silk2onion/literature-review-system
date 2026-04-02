export type SingleSourceConfig = {
  enabled: boolean;
  api_key: string;
  engine?: string | null;
};

export type RagConfig = {
  enabled: boolean;
};

export type DataSourcesConfig = {
  serpapi: SingleSourceConfig;
  scopus: SingleSourceConfig;
  rag: RagConfig;
};

export type ModelOptions = {
  llm_models: string[];
  embedding_models: string[];
  current_llm_model: string;
  current_embedding_model: string;
};

export type AgentConfig = {
  proactive_enabled: boolean;
  heartbeat_interval: number;
};

export type LLMConnectionConfig = {
  api_key: string;
  base_url: string;
};

export type ReviewDefaultsConfig = {
  citation_style: string;
  language: string;
  paper_limit: number;
  section_temperature: number;
  framework_temperature: number;
  section_max_tokens: number;
};

export type CrawlerConfig = {
  delay_min: number;
  delay_max: number;
  max_retries: number;
  timeout: number;
};

export type SearchConfig = {
  default_top_k: number;
  recall_alpha: number;
  embedding_text_max_length: number;
  use_graph_propagation: boolean;
};

export type DisciplineProfileConfig = {
  field_name: string;
  researcher_identity: string;
  review_system_prompt: string;
  review_user_template: string;
  example_timeline_topics: string[];
  example_theme_labels: string[];
  claims_system_prompt: string;
  framework_system_prompt: string;
  section_system_prompt: string;
};

export type DebugResult = {
  [source: string]: {
    enabled: boolean;
    count: number;
  };
};
