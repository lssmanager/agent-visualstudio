import { Wrench, Circle } from 'lucide-react';
import { AgentSpec } from '../../lib/types';

// Deterministic avatar color from agent id
const AVATAR_PALETTE = [
  '#2259F2', // brand blue
  '#22C55E', // success green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#0EA5E9', // sky
  '#F3B723', // accent gold
  '#052490', // deep blue
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

const MODE_LABEL: Record<string, string> = {
  direct:        'Direct',
  orchestrated:  'Orchestrated',
  handoff:       'Handoff',
  proactive:     'Proactive',
};

interface AgentCardProps {
  agent:     AgentSpec;
  selected?: boolean;
  onClick?:  () => void;
}

export function AgentCard({ agent, selected, onClick }: AgentCardProps) {
  const initial  = (agent.name ?? '?')[0].toUpperCase();
  const bg       = avatarColor(agent.id);
  const enabled  = agent.isEnabled !== false;
  const skillCnt = agent.skillRefs.length;
  const modeText = agent.executionMode ? (MODE_LABEL[agent.executionMode] ?? agent.executionMode) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={`group cursor-pointer rounded-xl p-4 border transition-all duration-150 outline-none
        ${selected
          ? 'border-[var(--color-primary)] shadow-[0_0_0_3px_var(--color-primary-soft)]'
          : 'border-[var(--card-border)] hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-md)]'
        }`}
      style={{ background: 'var(--card-bg)' }}
    >
      {/* Top row: avatar + status dot */}
      <div className="flex items-start justify-between mb-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-heading font-semibold flex-shrink-0"
          style={{ background: bg }}
        >
          {initial}
        </div>
        {/* Status dot */}
        <Circle
          size={8}
          className={enabled ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'}
        />
      </div>

      {/* Name */}
      <p
        className="text-sm font-semibold leading-tight truncate mb-1 group-hover:text-[var(--color-primary)] transition-colors"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
      >
        {agent.name}
      </p>

      {/* Mode badge */}
      {modeText && (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium mb-1.5"
          style={{
            background: 'var(--color-primary-soft)',
            color:      'var(--color-primary)',
          }}
        >
          {modeText}
        </span>
      )}

      {/* Role */}
      {agent.role && (
        <p className="text-xs truncate mb-2" style={{ color: 'var(--text-muted)' }}>
          {agent.role}
        </p>
      )}

      {/* Bottom: model + skills */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
        {agent.model ? (
          <span
            className="text-[11px] font-mono truncate"
            style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            {agent.model}
          </span>
        ) : (
          <span />
        )}
        {skillCnt > 0 && (
          <span
            className="flex items-center gap-1 text-[11px] flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <Wrench size={11} />
            {skillCnt}
          </span>
        )}
      </div>
    </div>
  );
}
