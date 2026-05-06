/**
 * session-manager.ts
 *
 * Gestiona sesiones de canal activas usando ChannelSession de Prisma.
 * Previamente usaba `prisma.session` que no existe en el schema.
 */
import type { PrismaClient } from '@prisma/client';

export interface SessionHistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ActiveSession {
  id: string;
  channelId: string;
  agentId?: string | null;
  metadata?: Record<string, unknown>;
  history: SessionHistoryEntry[];
}

export class SessionManager {
  constructor(private readonly db: PrismaClient) {}

  async getOrCreateSession(
    channelId: string,
    agentId?: string,
  ): Promise<ActiveSession> {
    const existing = await this.db.channelSession.findFirst({
      where: { channelId, status: { not: 'closed' } },
    });

    if (existing) {
      return {
        id:        existing.id,
        channelId: existing.channelId,
        agentId:   existing.agentId,
        metadata:  existing.metadata as Record<string, unknown> | undefined,
        history:   (existing.history as SessionHistoryEntry[] | null) ?? [],
      };
    }

    const created = await this.db.channelSession.create({
      data: {
        channelId,
        agentId: agentId ?? null,
        status:  'active',
        metadata: {} as unknown as import('@prisma/client').Prisma.InputJsonValue,
        history:  [] as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });

    return {
      id:        created.id,
      channelId: created.channelId,
      agentId:   created.agentId,
      metadata:  {},
      history:   [],
    };
  }

  async appendHistory(
    sessionId: string,
    entry: SessionHistoryEntry,
  ): Promise<void> {
    const session = await this.db.channelSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const history = ((session.history as SessionHistoryEntry[] | null) ?? []);
    history.push(entry);

    await this.db.channelSession.update({
      where: { id: sessionId },
      data:  { history: history as unknown as import('@prisma/client').Prisma.InputJsonValue },
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.db.channelSession.update({
      where: { id: sessionId },
      data:  { status: 'closed' },
    });
  }

  async getSessionById(sessionId: string): Promise<ActiveSession | null> {
    const session = await this.db.channelSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return null;
    return {
      id:        session.id,
      channelId: session.channelId,
      agentId:   session.agentId,
      metadata:  session.metadata as Record<string, unknown> | undefined,
      history:   (session.history as SessionHistoryEntry[] | null) ?? [],
    };
  }
}
