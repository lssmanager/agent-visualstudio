import { useState, type CSSProperties } from 'react';
import { MessageSquare, Circle } from 'lucide-react';

import type { DashboardOperationsDto, DashboardOverviewDto } from '../../../../lib/types';

const STATUS_CONFIG = {
  active:  { color: 'var(--tone-success-text, #10b981)', label: 'Active' },
  idle:    { color: 'var(--text-muted)', label: 'Idle' },
  paused:  { color: 'var(--tone-warning-text, #f59e0b)', label: 'Paused' },
  closed:  { color: 'var(--tone-danger-text, #ef4444)', label: 'Closed' },
  unknown: { color: 'var(--text-muted)', label: 'Unknown' },
} as const;

export function SessionsSurface({
  overview,
  operations,
}: {
  overview: DashboardOverviewDto;
  operations: DashboardOperationsDto;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = operations.recentSessions.find((s) => s.id === selectedId) ?? null;

  return (
    <section style={panelStyle}>
      {/* ── Header + summary ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Sessions</h2>
          <span style={modePill}>{overview.sessionsSummary.mode}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip label="Active" value={overview.sessionsSummary.active} tone="success" />
          <Chip label="Paused" value={overview.sessionsSummary.paused} tone="warning" />
          <Chip label="Total" value={overview.sessionsSummary.total} tone="default" />
        </div>
      </div>

      {/* ── Split layout: session list + chat ───────────────────────── */}
      <div style={splitLayout}>
        {/* Session list */}
        <div style={sessionListPane}>
          {operations.recentSessions.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <MessageSquare size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No sessions in this scope.</div>
            </div>
          ) : (
            operations.recentSessions.map((session) => {
              const statusCfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.unknown;
              const isSelected = session.id === selectedId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : session.id)}
                  style={{
                    ...sessionRow,
                    background: isSelected ? 'var(--color-primary-soft)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                >
                  {/* Avatar */}
                  <div style={{ ...avatar, background: stringToColor(session.id) }}>
                    {session.id.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                      <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {session.id.slice(0, 12)}
                      </code>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {session.lastEventAt ? new Date(session.lastEventAt).toLocaleTimeString() : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Circle size={6} style={{ color: statusCfg.color, fill: statusCfg.color }} />
                      <span style={{ fontSize: 10, color: statusCfg.color, fontWeight: 600 }}>{statusCfg.label}</span>
                      {session.channel && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>· {session.channel}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat pane */}
        <div style={chatPane}>
          {selected ? (
            <>
              {/* Chat header */}
              <div style={chatHeader}>
                <div style={{ ...avatar, background: stringToColor(selected.id), width: 28, height: 28, fontSize: 9 }}>
                  {selected.id.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700 }}>
                    {selected.id.slice(0, 16)}
                  </code>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                    {selected.channel ?? 'no channel'} · {STATUS_CONFIG[selected.status as keyof typeof STATUS_CONFIG]?.label ?? selected.status}
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div style={messagesArea}>
                {/* Placeholder bubbles — real messages would come from a session detail endpoint */}
                <ChatMsg role="agent" text="Session started. How can I help you?" />
                <ChatMsg role="user" text="[Live session data not yet streamed — check Sessions page for full history.]" />
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Full message history available on the Sessions page.
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div style={chatEmpty}>
              <MessageSquare size={20} style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                Select a session to preview
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'default' }) {
  const color =
    tone === 'success' ? 'var(--tone-success-text, #10b981)'
    : tone === 'warning' ? 'var(--tone-warning-text, #f59e0b)'
    : 'var(--text-muted)';
  const bg =
    tone === 'success' ? 'var(--tone-success-bg, rgba(16,185,129,0.08))'
    : tone === 'warning' ? 'var(--tone-warning-bg, rgba(245,158,11,0.08))'
    : 'var(--bg-secondary)';
  return (
    <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', background: bg, padding: '4px 10px', textAlign: 'center', minWidth: 52 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function ChatMsg({ role, text }: { role: 'agent' | 'user'; text: string }) {
  const isAgent = role === 'agent';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isAgent ? 'flex-start' : 'flex-end',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
          background: isAgent ? 'var(--bg-secondary)' : 'var(--color-primary-soft)',
          border: '1px solid var(--border-primary)',
          padding: '7px 10px',
          fontSize: 12,
          color: 'var(--text-primary)',
          lineHeight: 1.4,
        }}
      >
        {isAgent && (
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 3 }}>
            Agent
          </div>
        )}
        {text}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#2259F2', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#6366f1',
];

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 16,
  display: 'grid',
  gap: 12,
};

const splitLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '200px 1fr',
  gap: 0,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
  minHeight: 240,
};

const sessionListPane: CSSProperties = {
  borderRight: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  overflowY: 'auto',
  maxHeight: 320,
};

const sessionRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '9px 10px',
  cursor: 'pointer',
  border: 'none',
  borderBottom: '1px solid var(--border-primary)',
  textAlign: 'left',
  transition: 'background 0.15s',
};

const chatPane: CSSProperties = {
  background: 'var(--bg-primary)',
  display: 'flex',
  flexDirection: 'column',
};

const chatHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
};

const messagesArea: CSSProperties = {
  flex: 1,
  padding: 12,
  overflowY: 'auto',
};

const chatEmpty: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const avatar: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 700,
  color: '#fff',
  flexShrink: 0,
  userSelect: 'none',
};

const modePill: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: '2px 7px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
