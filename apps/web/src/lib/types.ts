// ─── Channel types (appended to existing types) ─────────────────────────────
export type ChannelKind = 'telegram' | 'whatsapp' | 'discord' | 'webchat';

export interface ChannelRecord {
  id: string;
  workspaceId: string;
  kind: ChannelKind;
  name: string;
  status: 'idle' | 'provisioning' | 'active' | 'error';
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LlmProviderRecord {
  id: string;
  workspaceId: string;
  provider: string; // 'openai' | 'anthropic' | 'openrouter' | 'deepseek' | 'qwen'
  label: string;
  maskedKey: string; // e.g. 'sk-...xxxx'
  isDefault: boolean;
  createdAt: string;
}

// ─── Re-export everything that was already here ───────────────────────────────
export * from './types-base';
