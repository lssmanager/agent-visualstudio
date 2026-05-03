import type { ChannelRecord, ChannelKind, LlmProviderRecord } from './types';

const BASE = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Channels ───────────────────────────────────────────────────────────────────────────────
export function listChannels(workspaceId: string) {
  return request<ChannelRecord[]>(`/workspaces/${workspaceId}/channels`);
}

export function provisionChannel(
  workspaceId: string,
  payload: {
    kind:       ChannelKind;
    name:       string;
    token?:     string;   // Telegram, WhatsApp, Discord
    appId?:     string;   // Slack, Teams
    appSecret?: string;   // Slack, Teams (renamed from 'secret' for clarity)
  },
) {
  return request<ChannelRecord>(`/workspaces/${workspaceId}/channels/provision`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function bindChannel(workspaceId: string, channelId: string, agentId: string) {
  return request<ChannelRecord>(`/workspaces/${workspaceId}/channels/${channelId}/bind`, {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

export function getChannelStatus(workspaceId: string, channelId: string) {
  return request<{ status: ChannelRecord['status']; detail?: string }>(
    `/workspaces/${workspaceId}/channels/${channelId}/status`,
  );
}

export function deleteChannel(workspaceId: string, channelId: string) {
  return request<void>(`/workspaces/${workspaceId}/channels/${channelId}`, { method: 'DELETE' });
}

// SSE helper — returns cleanup fn
export function subscribeChannelStatus(
  workspaceId: string,
  channelId: string,
  onEvent: (data: { status: string; detail?: string }) => void,
): () => void {
  const es = new EventSource(`${BASE}/workspaces/${workspaceId}/channels/${channelId}/status/stream`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data as string)); } catch { /* ignore */ }
  };
  return () => es.close();
}

// ─── LLM Providers ───────────────────────────────────────────────────────────────────────
export function listLlmProviders(workspaceId: string) {
  return request<LlmProviderRecord[]>(`/workspaces/${workspaceId}/llm-providers`);
}

export function upsertLlmProvider(
  workspaceId: string,
  payload: { provider: string; label: string; apiKey: string; isDefault?: boolean },
) {
  return request<LlmProviderRecord>(`/workspaces/${workspaceId}/llm-providers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteLlmProvider(workspaceId: string, providerId: string) {
  return request<void>(`/workspaces/${workspaceId}/llm-providers/${providerId}`, { method: 'DELETE' });
}
