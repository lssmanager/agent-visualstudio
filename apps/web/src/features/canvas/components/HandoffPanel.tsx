import type { AgentSpec } from '../../../lib/types';

interface HandoffPanelProps {
  config: Record<string, unknown>;
  agents: AgentSpec[];
  onChange: (config: Record<string, unknown>) => void;
}

export function HandoffPanel({ config, agents, onChange }: HandoffPanelProps) {
  function set(key: string, val: unknown) {
    onChange({ ...config, [key]: val });
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Target Agent
      </label>
      <select
        value={(config.targetAgentId as string) ?? ''}
        onChange={(e) => {
          const agent = agents.find((a) => a.id === e.target.value);
          if (agent) onChange({ ...config, targetAgentId: agent.id, targetAgentName: agent.name });
          else set('targetAgentId', e.target.value);
        }}
        className="w-full rounded border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      >
        <option value="">-- Select target agent --</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Reason (optional)
      </label>
      <input
        value={(config.reason as string) ?? ''}
        onChange={(e) => set('reason', e.target.value)}
        placeholder="Why this agent?"
        className="w-full rounded border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      />
    </div>
  );
}
