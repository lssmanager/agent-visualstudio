import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ChannelKind = 'telegram' | 'whatsapp' | 'discord' | 'webchat';
export type ChannelStatus = 'idle' | 'provisioning' | 'active' | 'error';

export interface ChannelRecord {
  id: string;
  workspaceId: string;
  kind: ChannelKind;
  name: string;
  status: ChannelStatus;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LlmProviderRecord {
  id: string;
  workspaceId: string;
  provider: string;
  label: string;
  maskedKey: string;
  isDefault: boolean;
  createdAt: string;
}

// ─── In-memory store (replace with Prisma once schema lands) ─────────────────
// Channels map: workspaceId → ChannelRecord[]
const channelStore = new Map<string, ChannelRecord[]>();
// LLM providers map: workspaceId → LlmProviderRecord[]
const llmStore = new Map<string, LlmProviderRecord[]>();
// Status SSE subscribers: channelId → Set of push fns
const sseSubscribers = new Map<string, Set<(data: string) => void>>();

const ENC_KEY = process.env['CHANNEL_ENC_KEY'] ??
  'default-insecure-32-byte-key-dev!!'; // must be 32 chars in prod

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(ENC_KEY.slice(0, 32)),
    iv,
  );
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), enc.toString('hex'), tag.toString('hex')].join('.');
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '…' + key.slice(-4);
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  // ─── Channel lifecycle ───────────────────────────────────────────────
  list(workspaceId: string): ChannelRecord[] {
    return channelStore.get(workspaceId) ?? [];
  }

  provision(
    workspaceId: string,
    dto: { kind: ChannelKind; name: string; token?: string; appId?: string; secret?: string },
  ): ChannelRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: ChannelRecord = {
      id,
      workspaceId,
      kind: dto.kind,
      name: dto.name,
      status: 'provisioning',
      agentId: null,
      createdAt: now,
      updatedAt: now,
    };

    // Encrypt & store credential if present (in-mem for now)
    if (dto.token) {
      const _encrypted = encrypt(dto.token);
      this.logger.log(`Channel ${id} token encrypted (${dto.kind})`);
    }

    const list = channelStore.get(workspaceId) ?? [];
    list.push(record);
    channelStore.set(workspaceId, list);

    // Simulate async provisioning
    setTimeout(() => this._setStatus(workspaceId, id, 'active'), 2000);

    return record;
  }

  bind(workspaceId: string, channelId: string, agentId: string): ChannelRecord {
    const record = this._find(workspaceId, channelId);
    record.agentId = agentId;
    record.updatedAt = new Date().toISOString();
    return record;
  }

  getStatus(workspaceId: string, channelId: string) {
    const record = this._find(workspaceId, channelId);
    return { status: record.status };
  }

  delete(workspaceId: string, channelId: string): void {
    const list = channelStore.get(workspaceId) ?? [];
    channelStore.set(workspaceId, list.filter((c) => c.id !== channelId));
    sseSubscribers.delete(channelId);
  }

  // SSE push
  addSseSubscriber(channelId: string, fn: (data: string) => void): () => void {
    let set = sseSubscribers.get(channelId);
    if (!set) { set = new Set(); sseSubscribers.set(channelId, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }

  private _find(workspaceId: string, channelId: string): ChannelRecord {
    const record = (channelStore.get(workspaceId) ?? []).find((c) => c.id === channelId);
    if (!record) throw new NotFoundException(`Channel ${channelId} not found`);
    return record;
  }

  private _setStatus(workspaceId: string, channelId: string, status: ChannelStatus) {
    try {
      const record = this._find(workspaceId, channelId);
      record.status = status;
      record.updatedAt = new Date().toISOString();
      const payload = JSON.stringify({ status, detail: `Channel ${status}` });
      sseSubscribers.get(channelId)?.forEach((fn) => fn(payload));
    } catch { /* already deleted */ }
  }

  // ─── LLM Providers ───────────────────────────────────────────────────
  listProviders(workspaceId: string): LlmProviderRecord[] {
    return llmStore.get(workspaceId) ?? [];
  }

  upsertProvider(
    workspaceId: string,
    dto: { provider: string; label: string; apiKey: string; isDefault?: boolean },
  ): LlmProviderRecord {
    const list = llmStore.get(workspaceId) ?? [];
    const existing = list.find((p) => p.provider === dto.provider);

    if (dto.isDefault) {
      list.forEach((p) => { p.isDefault = false; });
    }

    if (existing) {
      existing.label = dto.label;
      existing.maskedKey = maskKey(dto.apiKey);
      existing.isDefault = dto.isDefault ?? existing.isDefault;
      // encrypt(dto.apiKey) → store securely (Prisma/Vault in prod)
      return existing;
    }

    const record: LlmProviderRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      provider: dto.provider,
      label: dto.label,
      maskedKey: maskKey(dto.apiKey),
      isDefault: dto.isDefault ?? false,
      createdAt: new Date().toISOString(),
    };
    list.push(record);
    llmStore.set(workspaceId, list);
    return record;
  }

  deleteProvider(workspaceId: string, providerId: string): void {
    const list = llmStore.get(workspaceId) ?? [];
    llmStore.set(workspaceId, list.filter((p) => p.id !== providerId));
  }
}
