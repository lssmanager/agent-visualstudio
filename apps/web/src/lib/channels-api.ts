import type { ChannelRecord, ChannelKind, LlmProviderRecord, ChannelBinding } from './types';

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

// Discriminated union — TypeScript enforces correct credential fields per kind.
// This prevents invalid mixes (e.g. teams + token) from compiling.
type ProvisionPayload =
  | { kind: 'telegram' | 'whatsapp' | 'discord'; name: string; token: string }
  | { kind: 'slack';   name: string; appId: string; appSecret: string }
  | { kind: 'teams';   name: string; appId: string; appPassword: string }
  | { kind: 'webchat' | 'webhook'; name: string };

export function provisionChannel(
  workspaceId: string,
  payload: ProvisionPayload,
) {
  return request<ChannelRecord>(`/workspaces/${workspaceId}/channels/provision`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// F6-13: actualizar nombre/enabled de un canal existente
export function updateChannel(
  workspaceId: string,
  channelId: string,
  payload: { name?: string; enabled?: boolean },
) {
  return request<ChannelRecord>(`/workspaces/${workspaceId}/channels/${channelId}`, {
    method: 'PATCH',
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

// ─── Channel Bindings (F6-13) ─────────────────────────────────────────────────────────────

/** Lista todos los bindings de un canal */
export function listBindings(workspaceId: string, channelId: string) {
  return request<ChannelBinding[]>(`/workspaces/${workspaceId}/channels/${channelId}/bindings`);
}

/** Crea un nuevo binding canal ↔ agente */
export function createBinding(
  workspaceId: string,
  channelId: string,
  payload: { agentId: string; mode?: ChannelBinding['mode']; enabled?: boolean },
) {
  return request<ChannelBinding>(`/workspaces/${workspaceId}/channels/${channelId}/bindings`, {
    method: 'POST',
    body: JSON.stringify({ mode: 'primary', enabled: true, ...payload }),
  });
}

/** Actualiza enabled y/o mode de un binding */
export function updateBinding(
  workspaceId: string,
  channelId: string,
  bindingId: string,
  payload: { enabled?: boolean; mode?: ChannelBinding['mode'] },
) {
  return request<ChannelBinding>(
    `/workspaces/${workspaceId}/channels/${channelId}/bindings/${bindingId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

/** Elimina un binding */
export function deleteBinding(
  workspaceId: string,
  channelId: string,
  bindingId: string,
) {
  return request<void>(
    `/workspaces/${workspaceId}/channels/${channelId}/bindings/${bindingId}`,
    { method: 'DELETE' },
  );
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
