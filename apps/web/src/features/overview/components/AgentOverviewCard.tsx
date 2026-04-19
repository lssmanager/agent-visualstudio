import { AgentSpec, FlowSpec } from '../../../lib/types';

const AVATAR_PALETTE = [
  '#2259F2', '#22C55E', '#F59E0B', '#EF4444',
  '#8B5CF6', '#0EA5E9', '#F3B723', '#052490',
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

const KIND_LABEL: Record<string, string> = {
  agent:        'Primary',
  orchestrator: 'Orchestrator',
  subagent:     'Worker',
};

interface AgentOverviewCardProps {
  agent: AgentSpec;
  flows: FlowSpec[];
  onToggle?: () => void;
  onClick?: () => void;
}

export function AgentOverviewCard({ agent, flows, onToggle, onClick }: AgentOverviewCardProps) {
  const initial = (agent.name ?? '?')[0].toUpperCase();
  const bg = avatarColor(agent.id);
  const enabled = agent.isEnabled !== false;
  const skillCount = agent.skillRefs?.length ?? 0;
  const kindLabel = KIND_LABEL[agent.kind ?? 'agent'] ?? 'Specialist';
  const linkedFlows = flows.filter((f) =>
    f.nodes?.some((n) => n.config?.agentId === agent.id || n.id === agent.id),
  ).length;

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--card-border)',
        background: 'var(--card-bg)',
        boxShadow: 'var(--shadow-sm)',
        padding: 20,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all var(--transition)',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)';
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      {/* Top row: avatar + toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 'var(--radius-md)',
            background: bg,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>

        {/* Toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          style={{
            width: 40,
            height: 22,
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: enabled ? 'var(--color-primary)' : 'var(--bg-tertiary)',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background var(--transition)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: enabled ? 21 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left var(--transition)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </button>
      </div>

      {/* Name + description */}
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', margin: '0 0 4px 0', lineHeight: 1.3 }}>
        {agent.name}
      </p>
      {agent.description && (
        <p style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          margin: '0 0 10px 0',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {agent.description}
        </p>
      )}

      {/* Kind badge + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
          }}
        >
          {kindLabel}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            background: enabled ? 'var(--tone-success-bg)' : 'var(--bg-tertiary)',
            color: enabled ? 'var(--tone-success-text)' : 'var(--text-muted)',
            border: `1px solid ${enabled ? 'var(--tone-success-border)' : 'var(--border-primary)'}`,
          }}
        >
          {enabled ? 'Active' : 'Disabled'}
        </span>
      </div>

      {/* Model */}
      {agent.model && (
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
          {agent.model}
        </p>
      )}

      {/* 2x2 metadata grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px 16px',
          paddingTop: 12,
          borderTop: '1px solid var(--border-secondary)',
        }}
      >
        {[
          { label: 'Tools', val: String(skillCount) },
          { label: 'Flows linked', val: String(linkedFlows) },
          { label: 'Last run', val: 'N/A' },
          { label: 'Health', val: enabled ? 'Stable' : 'Idle' },
        ].map((item) => (
          <div key={item.label}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0 }}>
              {item.label}
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {item.val}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
