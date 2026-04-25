import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService } from '../../lib/prisma.service';
// import type {
//   Channel,
//   LlmProvider,
//   ChannelKind,
//   ChannelStatus,
// } from '@prisma/client';
// Commented out: Types don't exist in @prisma/client. Using 'any' casting instead.

// ─── DTOs ────────────────────────────────────────────────────────────────────
export interface ProvisionChannelDto {
  workspaceId: string;
  kind: string; // Was: ChannelKind
  token: string;           // cleartext — se cifra aquí antes de persistir
  meta?: Record<string, unknown>;
}

export interface BindChannelDto {
  agentId: string;
}

export interface CreateLlmProviderDto {
  workspaceId: string;
  provider: string;
  apiKey: string;          // cleartext
  baseUrl?: string;
  isDefault?: boolean;
}

export interface ChannelRecord {
  id: string;
  workspaceId: string;
  kind: string; // Was: ChannelKind
  status: string; // Was: ChannelStatus
  boundAgentId: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  // tokenEnc se omite — nunca se expone al cliente
}

export interface LlmProviderRecord {
  id: string;
  workspaceId: string;
  provider: string;
  apiKeyMasked: string;    // solo los últimos 4 chars visibles
  baseUrl: string | null;
  isDefault: boolean;
  createdAt: Date;
}

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private readonly ENC_KEY: Buffer;
  private readonly ALG = 'aes-256-gcm';

  // SSE subscribers: channelId → Set<(data: string) => void>
  private readonly subs = new Map<string, Set<(d: string) => void>>();

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.CHANNEL_ENC_KEY ?? '';
    if (key.length !== 32) {
      this.logger.warn('CHANNEL_ENC_KEY debe tener exactamente 32 caracteres');
    }
    this.ENC_KEY = Buffer.from(key.padEnd(32, '0').slice(0, 32));
  }

  // ── Cifrado ──────────────────────────────────────────────────────────────
  private encrypt(plaintext: string): string {
    const iv  = randomBytes(12);
    const cipher = createCipheriv(this.ALG, this.ENC_KEY, iv);
    const enc  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag  = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  private decrypt(stored: string): string {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const decipher = createDecipheriv(this.ALG, this.ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
  }

  // ── Channels CRUD ────────────────────────────────────────────────────────
  async provision(dto: ProvisionChannelDto): Promise<ChannelRecord> {
    const tokenEnc = this.encrypt(dto.token);
    const channel = await this.prisma.channel.create({
      data: {
        workspaceId: dto.workspaceId,
        kind:        dto.kind,
        tokenEnc,
        meta:        (dto.meta ?? {}) as any,
        status:      'provisioned',
      },
    });
    this.logger.log(`Channel provisioned: ${channel.id} (${channel.kind})`);
    this._emit(channel.id, { status: 'provisioned' });
    return this._toRecord(channel);
  }

  async bind(channelId: string, dto: BindChannelDto): Promise<ChannelRecord> {
    const channel = await this.prisma.channel.update({
      where:  { id: channelId },
      data:   { boundAgentId: dto.agentId, status: 'bound' },
    }).catch(() => { throw new NotFoundException(`Channel ${channelId} not found`); });
    this.logger.log(`Channel ${channelId} bound to agent ${dto.agentId}`);
    this._emit(channelId, { status: 'bound', agentId: dto.agentId });
    return this._toRecord(channel);
  }

  async getStatus(channelId: string): Promise<ChannelRecord> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    return this._toRecord(channel);
  }

  async listByWorkspace(workspaceId: string): Promise<ChannelRecord[]> {
    const channels = await this.prisma.channel.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return channels.map((c: any) => this._toRecord(c));
  }

  async delete(channelId: string): Promise<void> {
    await this.prisma.channel.delete({ where: { id: channelId } })
      .catch(() => { throw new NotFoundException(`Channel ${channelId} not found`); });
    this._emit(channelId, { status: 'deleted' });
    this.subs.delete(channelId);
  }

  // ── LLM Providers ────────────────────────────────────────────────────────
  async createProvider(dto: CreateLlmProviderDto): Promise<LlmProviderRecord> {
    const apiKeyEnc = this.encrypt(dto.apiKey);
    // Si se marca como default, quitar default de los demás del workspace
    if (dto.isDefault) {
      await this.prisma.llmProvider.updateMany({
        where: { workspaceId: dto.workspaceId },
        data:  { isDefault: false },
      });
    }
    const prov = await this.prisma.llmProvider.upsert({
      where:  { workspaceId_provider: { workspaceId: dto.workspaceId, provider: dto.provider } },
      update: { apiKeyEnc, baseUrl: dto.baseUrl ?? null, isDefault: dto.isDefault ?? false },
      create: {
        workspaceId: dto.workspaceId,
        provider:    dto.provider,
        apiKeyEnc,
        baseUrl:     dto.baseUrl ?? null,
        isDefault:   dto.isDefault ?? false,
      },
    });
    return this._toProviderRecord(prov);
  }

  async listProviders(workspaceId: string): Promise<LlmProviderRecord[]> {
    const provs = await this.prisma.llmProvider.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return provs.map((p: any) => this._toProviderRecord(p));
  }

  async deleteProvider(providerId: string): Promise<void> {
    await this.prisma.llmProvider.delete({ where: { id: providerId } })
      .catch(() => { throw new NotFoundException(`LlmProvider ${providerId} not found`); });
  }

  // Expone la API key descifrada — solo para uso interno del runtime
  async resolveApiKey(providerId: string): Promise<string> {
    const prov = await this.prisma.llmProvider.findUnique({ where: { id: providerId } });
    if (!prov) throw new NotFoundException(`LlmProvider ${providerId} not found`);
    return this.decrypt(prov.apiKeyEnc);
  }

  // ── SSE ──────────────────────────────────────────────────────────────────
  subscribe(channelId: string, cb: (data: string) => void): () => void {
    if (!this.subs.has(channelId)) this.subs.set(channelId, new Set());
    this.subs.get(channelId)!.add(cb);
    return () => this.subs.get(channelId)?.delete(cb);
  }

  private _emit(channelId: string, payload: object) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    this.subs.get(channelId)?.forEach((cb) => cb(data));
  }

  // ── Mappers ──────────────────────────────────────────────────────────────
  private _toRecord(c: any): ChannelRecord {
    return {
      id:           c.id,
      workspaceId:  c.workspaceId,
      kind:         c.kind,
      status:       c.status,
      boundAgentId: c.boundAgentId,
      meta:         c.meta as Record<string, unknown>,
      createdAt:    c.createdAt,
      updatedAt:    c.updatedAt,
    };
  }

  private _toProviderRecord(p: any): LlmProviderRecord {
    // Desciframos solo para enmascarar — nunca exponemos el plaintext
    let masked = '••••';
    try {
      const plain = this.decrypt(p.apiKeyEnc);
      masked = plain.length > 4 ? `••••${plain.slice(-4)}` : '••••';
    } catch { /* si falla el decrypt, mostramos placeholder */ }
    return {
      id:          p.id,
      workspaceId: p.workspaceId,
      provider:    p.provider,
      apiKeyMasked: masked,
      baseUrl:     p.baseUrl,
      isDefault:   p.isDefault,
      createdAt:   p.createdAt,
    };
  }
}
