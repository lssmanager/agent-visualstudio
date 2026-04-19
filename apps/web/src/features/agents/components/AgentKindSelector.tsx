import type { AgentKind } from '../../../lib/types';

const KINDS: { value: AgentKind; label: string; description: string }[] = [
  { value: 'agent', label: 'Agent', description: 'Standalone agent that executes tasks directly' },
  { value: 'subagent', label: 'Sub-agent', description: 'Child agent delegated to by an orchestrator' },
  { value: 'orchestrator', label: 'Orchestrator', description: 'Coordinates and delegates to sub-agents' },
];

interface AgentKindSelectorProps {
  value: AgentKind;
  onChange: (kind: AgentKind) => void;
}

export function AgentKindSelector({ value, onChange }: AgentKindSelectorProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        Agent Kind
      </label>
      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => onChange(k.value)}
            className="flex-1 rounded border px-3 py-2 text-sm transition-colors"
            style={{
              borderColor: value === k.value ? 'var(--color-primary)' : 'var(--border-primary)',
              background: value === k.value ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
              color: value === k.value ? 'var(--color-primary)' : 'var(--text-primary)',
              fontWeight: value === k.value ? 600 : 400,
            }}
            title={k.description}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
