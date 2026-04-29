import { GatewayService } from '../gateway/gateway.service';

export interface ChannelRecord {
  channel: string;
  sessions: number;
  activeSessions: number;
  pausedSessions: number;
  closedSessions: number;
}

export interface ChannelSession {
  id: string;
  channel: string;
  status: 'active' | 'paused' | 'closed' | 'unknown';
  lastEventAt?: string;
  metadata?: Record<string, unknown>;
}

export class ChannelsService {
  private gateway = new GatewayService();

  async listChannels(): Promise<{ ok: boolean; payload: ChannelRecord[] }> {
    const sessions = await this.gateway.inspectSessions();
    const map = new Map<string, ChannelRecord>();

    for (const session of sessions) {
      const channel = session.ref.channel ?? 'unknown';
      if (!map.has(channel)) {
        map.set(channel, {
          channel,
          sessions: 0,
          activeSessions: 0,
          pausedSessions: 0,
          closedSessions: 0,
        });
      }
      const entry = map.get(channel)!;
      entry.sessions += 1;
      if (session.status === 'active') entry.activeSessions += 1;
      else if (session.status === 'paused') entry.pausedSessions += 1;
      else if (session.status === 'closed') entry.closedSessions += 1;
    }

    return { ok: true, payload: Array.from(map.values()) };
  }

  async getChannel(
    channel: string,
  ): Promise<{ ok: boolean; payload?: ChannelRecord; error?: string }> {
    const { payload } = await this.listChannels();
    const found = payload.find((c) => c.channel === channel);
    if (!found) {
      return { ok: false, error: `Channel '${channel}' not found` };
    }
    return { ok: true, payload: found };
  }

  async getChannelSessions(
    channel: string,
  ): Promise<{ ok: boolean; payload: ChannelSession[] }> {
    const sessions = await this.gateway.inspectSessions();
    const filtered = sessions
      .filter((s) => (s.ref.channel ?? 'unknown') === channel)
      .map((s) => ({
        id: s.ref.id,
        channel: s.ref.channel ?? 'unknown',
        status: s.status,
        lastEventAt: s.lastEventAt,
        metadata: s.metadata as Record<string, unknown> | undefined,
      }));

    return { ok: true, payload: filtered };
  }

  async disconnectChannel(
    channel: string,
  ): Promise<{ ok: boolean; disconnected: number; errors: string[] }> {
    const { payload: sessions } = await this.getChannelSessions(channel);
    const active = sessions.filter((s) => s.status === 'active');

    const results = await Promise.allSettled(
      active.map((s) => this.gateway.call('topology.disconnect', { sessionId: s.id })),
    );

    const errors: string[] = [];
    let disconnected = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && (r.value as { ok?: boolean }).ok) {
        disconnected += 1;
      } else {
        errors.push(
          r.status === 'rejected' ? String(r.reason) : 'disconnect failed',
        );
      }
    }

    return { ok: errors.length === 0, disconnected, errors };
  }
}
