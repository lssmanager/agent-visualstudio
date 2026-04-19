export interface ModelConfig {
  id: string;
  provider: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export interface WorkspaceConfig {
  version: '1';
  name: string;
  slug: string;
  description?: string;
  owner?: string;
  defaultModel: string;
  models?: ModelConfig[];
  agents: string[];
  flows: string[];
  skills: string[];
  policies: string[];
  hooks?: string;
  commands?: string[];
  tags: string[];
}
