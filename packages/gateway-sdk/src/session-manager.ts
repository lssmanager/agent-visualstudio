/**
 * session-manager.ts — Gateway session persistence via Prisma
 * FIX: prisma.channelSession → prisma.gatewaySession (correct model name in schema).
 */
import type { PrismaClient } from '@prisma/client';

export type SessionStatus = 'active' | 'paused' | 'closed' | 'unknown';

export interface GatewaySessionData {
  id:           string;
  channelId:    string;
  channelKind:  string;
  workspaceId:  string;
  agentId?:     string | null;
  userId?:      string | null;
  status:       SessionStatus;
  metadata?:    Record<string, unknown>;
  lastEventAt?: Date | null;
  createdAt?:   Date;
  updatedAt?:   Date;
}

export class SessionManager {
  constructor(private readonly db: PrismaClient) {}

  async create(data: {
    channelId:   string;
    channelKind: string;
    workspaceId: string;
    agentId?:    string | null;
    userId?:     string | null;
    metadata?:   Record<string, unknown>;
  }): Promise<GatewaySessionData> {
    const session = await (this.db as any).gatewaySession.create({
      data: {
        channelId:   data.channelId,
        channelKind: data.channelKind,
        workspaceId: data.workspaceId,
        agentId:     data.agentId     ?? null,
        userId:      data.userId      ?? null,
        status:      'active',
        metadata:    data.metadata    ?? {},
        lastEventAt: new Date(),
      },
    });
    return this._map(session);
  }

  async findById(id: string): Promise<GatewaySessionData | null> {
    const session = await (this.db as any).gatewaySession.findUnique({ where: { id } });
    if (!session) return null;
    return this._map(session);
  }

  async findByChannel(channelId: string): Promise<GatewaySessionData[]> {
    const sessions = await (this.db as any).gatewaySession.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s: any) => this._map(s));
  }

  async findActiveByChannel(channelId: string): Promise<GatewaySessionData | null> {
    const session = await (this.db as any).gatewaySession.findFirst({
      where: { channelId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) return null;
    return this._map(session);
  }

  async updateStatus(
    id: string,
    status: SessionStatus,
  ): Promise<GatewaySessionData> {
    const session = await (this.db as any).gatewaySession.update({
      where: { id },
      data:  { status, lastEventAt: new Date() },
    });
    return this._map(session);
  }

  async touch(id: string): Promise<void> {
    await (this.db as any).gatewaySession.update({
      where: { id },
      data:  { lastEventAt: new Date() },
    });
  }

  async close(id: string): Promise<GatewaySessionData> {
    return this.updateStatus(id, 'closed');
  }

  private _map(s: any): GatewaySessionData {
    return {
      id:          s.id,
      channelId:   s.channelId,
      channelKind: s.channelKind,
      workspaceId: s.workspaceId,
      agentId:     s.agentId     ?? null,
      userId:      s.userId      ?? null,
      status:      (s.status as SessionStatus) ?? 'unknown',
      metadata:    s.metadata    ?? {},
      lastEventAt: s.lastEventAt ?? null,
      createdAt:   s.createdAt,
      updatedAt:   s.updatedAt,
    };
  }
}
