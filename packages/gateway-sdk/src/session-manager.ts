/**
 * session-manager.ts
 *
 * SessionManager persists conversation turns to GatewaySession.messageHistory
 * and provides the last N messages for context injection into agent prompts.
 *
 * Message history format (stored as JSON in GatewaySession.messageHistory):
 *   Array<{ role: 'user'|'assistant', content: string, ts: string }>
 *
 * Hard cap: GATEWAY_SESSION_MAX_HISTORY (default 200) messages.
 * When the cap is reached the oldest messages are dropped, keeping the
 * system prompt if present (first message with role === 'system').
 */

import type { PrismaClient } from '@prisma/client';
import type { IncomingMessage, OutboundMessage } from './channel-adapter';

const MAX_HISTORY = Number(process.env.GATEWAY_SESSION_MAX_HISTORY ?? 200);

export interface SessionHistoryEntry {
  role:    'user' | 'assistant' | 'system';
  content: string;
  ts:      string;
}

export interface ActiveSession {
  id:             string;
  agentId:        string;
  externalUserId: string;
  history:        SessionHistoryEntry[];
}

export class SessionManager {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Upsert the GatewaySession for a (channelConfigId, externalUserId) pair,
   * append the incoming user message, and return the active session.
   */
  async receiveUserMessage(
    channelConfigId: string,
    agentId:         string,
    incoming:        IncomingMessage,
  ): Promise<ActiveSession> {
    const session = await this.db.gatewaySession.upsert({
      where: {
        channelConfigId_externalUserId: {
          channelConfigId,
          externalUserId: incoming.externalUserId,
        },
      },
      create: {
        channelConfigId,
        externalUserId: incoming.externalUserId,
        agentId,
        messageHistory: [],
        state:          'active',
      },
      update: {},
    });

    // If session was paused/closed, re-activate
    if (session.state !== 'active') {
      await this.db.gatewaySession.update({
        where: { id: session.id },
        data:  { state: 'active' },
      });
    }

    const history = session.messageHistory as SessionHistoryEntry[];
    const newEntry: SessionHistoryEntry = {
      role:    'user',
      content: buildUserContent(incoming),
      ts:      incoming.ts,
    };

    const updated = appendAndCap(history, newEntry, MAX_HISTORY);

    await this.db.gatewaySession.update({
      where: { id: session.id },
      data:  { messageHistory: updated, updatedAt: new Date() },
    });

    return {
      id:             session.id,
      agentId:        session.agentId,
      externalUserId: incoming.externalUserId,
      history:        updated,
    };
  }

  /**
   * Append an assistant reply to the session history.
   * Call this after the agent produces a response.
   */
  async recordAssistantReply(
    sessionId: string,
    outbound:  OutboundMessage,
  ): Promise<void> {
    const session = await this.db.gatewaySession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const history = session.messageHistory as SessionHistoryEntry[];
    const newEntry: SessionHistoryEntry = {
      role:    'assistant',
      content: outbound.text,
      ts:      new Date().toISOString(),
    };

    const updated = appendAndCap(history, newEntry, MAX_HISTORY);

    await this.db.gatewaySession.update({
      where: { id: sessionId },
      data:  { messageHistory: updated, updatedAt: new Date() },
    });
  }

  /**
   * Load a session by (channelConfigId, externalUserId).
   * Returns null if no session exists yet.
   */
  async findSession(
    channelConfigId: string,
    externalUserId:  string,
  ): Promise<ActiveSession | null> {
    const session = await this.db.gatewaySession.findUnique({
      where: {
        channelConfigId_externalUserId: { channelConfigId, externalUserId },
      },
    });
    if (!session) return null;
    return {
      id:             session.id,
      agentId:        session.agentId,
      externalUserId: session.externalUserId,
      history:        session.messageHistory as SessionHistoryEntry[],
    };
  }

  /**
   * Mark a session as paused or closed.
   */
  async setSessionState(
    sessionId: string,
    state:     'active' | 'paused' | 'closed',
  ): Promise<void> {
    await this.db.gatewaySession.update({
      where: { id: sessionId },
      data:  { state, updatedAt: new Date() },
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildUserContent(msg: IncomingMessage): string {
  const parts: string[] = [];
  if (msg.text) parts.push(msg.text);
  for (const att of msg.attachments) {
    parts.push(`[attachment: ${att.mimeType} ${att.name ?? att.url}]`);
  }
  return parts.join('\n') || '(empty message)';
}

function appendAndCap(
  history: SessionHistoryEntry[],
  entry:   SessionHistoryEntry,
  max:     number,
): SessionHistoryEntry[] {
  const updated = [...history, entry];
  if (updated.length <= max) return updated;

  // Keep system message at index 0 if present, then drop oldest non-system
  const systemMsg = updated[0]?.role === 'system' ? updated[0] : null;
  const rest = updated.filter((_, i) => !(systemMsg && i === 0));
  const trimmed = rest.slice(rest.length - (max - (systemMsg ? 1 : 0)));
  return systemMsg ? [systemMsg, ...trimmed] : trimmed;
}
