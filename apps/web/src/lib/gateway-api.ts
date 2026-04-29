/**
 * gateway-api.ts — Cliente HTTP tipado para /api/channels del Gateway
 *
 * Base URL: VITE_GATEWAY_URL env var (default: http://localhost:3200)
 * Distinto de /api/studio/v1 — este client habla directamente con
 * apps/gateway, no con apps/api.
 *
 * Todas las funciones lanzan Error si la respuesta HTTP no es 2xx.
 */

import type {
  ChannelConfig,
  ChannelListResponse,
  ChannelDetailResponse,
  CreateChannelPayload,
  AddBindingPayload,
  ChannelBinding,
} from '../features/channels/types';

const GATEWAY_BASE = (
  (import.meta as { env: Record<string, string> }).env.VITE_GATEWAY_URL ?? 'http://localhost:3200'
).replace(/\/+$/, '');

async function gw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include', // envia cookies de sesión Logto
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = text;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      msg = json.error ?? json.message ?? text;
    } catch { /* usa text crudo */ }
    throw new Error(msg || `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Channels CRUD
// ---------------------------------------------------------------------------

/** Lista canales. Opcionalmente filtra por agentId, type o isActive. */
export async function listChannels(filters?: {
  agentId?: string;
  type?: string;
  isActive?: boolean;
}): Promise<ChannelListResponse> {
  const params = new URLSearchParams();
  if (filters?.agentId)   params.set('agentId',  filters.agentId);
  if (filters?.type)      params.set('type',     filters.type);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  const qs = params.toString();
  return gw<ChannelListResponse>(`/api/channels${qs ? `?${qs}` : ''}`);
}

/** Crea un ChannelConfig + ChannelBinding inicial. */
export async function createChannel(
  payload: CreateChannelPayload,
): Promise<{ ok: boolean; channel: ChannelConfig; binding: ChannelBinding }> {
  return gw(`/api/channels`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Detalle de un canal (secrets redactados). */
export async function getChannel(id: string): Promise<ChannelDetailResponse> {
  return gw<ChannelDetailResponse>(`/api/channels/${encodeURIComponent(id)}`);
}

/** Actualiza name, config o secrets. */
export async function updateChannel(
  id: string,
  patch: { name?: string; config?: Record<string, unknown>; secrets?: Record<string, unknown> },
): Promise<{ ok: boolean; data: ChannelConfig }> {
  return gw(`/api/channels/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Elimina canal + bindings + sessions en cascada. */
export async function deleteChannel(id: string): Promise<{ ok: boolean }> {
  return gw(`/api/channels/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

/** Activa el canal (registra webhook externo si aplica, ej: Telegram). */
export async function activateChannel(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  return gw(`/api/channels/${encodeURIComponent(id)}/activate`, { method: 'POST' });
}

/** Desactiva el canal (revoca webhook externo si aplica). */
export async function deactivateChannel(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  return gw(`/api/channels/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------

/** Agrega un ChannelBinding adicional (canal → agente secundario). */
export async function addBinding(
  channelId: string,
  payload: AddBindingPayload,
): Promise<{ ok: boolean; data: ChannelBinding }> {
  return gw(`/api/channels/${encodeURIComponent(channelId)}/bindings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Elimina un binding específico. */
export async function removeBinding(
  channelId: string,
  bindingId: string,
): Promise<{ ok: boolean }> {
  return gw(
    `/api/channels/${encodeURIComponent(channelId)}/bindings/${encodeURIComponent(bindingId)}`,
    { method: 'DELETE' },
  );
}
