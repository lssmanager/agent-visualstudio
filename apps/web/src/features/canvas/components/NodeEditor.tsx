import type { AgentSpec, SkillSpec, FlowNodeType } from '../../../lib/types';
import { ConditionBuilder } from './ConditionBuilder';

interface NodeEditorProps {
  nodeId: string;
  nodeType: FlowNodeType | string;
  config: Record<string, unknown>;
  agents: AgentSpec[];
  skills: SkillSpec[];
  onChange: (config: Record<string, unknown>) => void;
  onDelete: () => void;
}

export function NodeEditor({ nodeId, nodeType, config, agents, skills, onChange, onDelete }: NodeEditorProps) {
  function updateField(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div
      className="rounded-lg border p-3 space-y-3"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Edit Node
        </h4>
        <button
          onClick={onDelete}
          className="text-[10px] px-2 py-0.5 rounded"
          style={{ color: '#dc2626', background: '#fee2e2' }}
        >
          Delete
        </button>
      </div>

      <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
        <div>ID: <span className="font-mono">{nodeId}</span></div>
        <div>Type: <span className="font-semibold">{nodeType}</span></div>
      </div>

      {/* Type-specific editors */}
      {nodeType === 'trigger' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Trigger Type</label>
          <select
            value={(config.triggerType as string) ?? 'manual'}
            onChange={(e) => updateField('triggerType', e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="manual">Manual</option>
            <option value="schedule">Schedule</option>
            <option value="webhook">Webhook</option>
            <option value="event">Event</option>
          </select>
          {config.triggerType === 'schedule' && (
            <input
              value={(config.schedule as string) ?? ''}
              onChange={(e) => updateField('schedule', e.target.value)}
              placeholder="Cron expression (e.g. 0 9 * * *)"
              className="w-full rounded border px-2 py-1 text-xs font-mono"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
            />
          )}
          {config.triggerType === 'webhook' && (
            <input
              value={(config.webhookPath as string) ?? ''}
              onChange={(e) => updateField('webhookPath', e.target.value)}
              placeholder="/webhook/path"
              className="w-full rounded border px-2 py-1 text-xs font-mono"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
            />
          )}
        </div>
      )}

      {nodeType === 'agent' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Agent</label>
          <select
            value={(config.agentId as string) ?? ''}
            onChange={(e) => {
              const agent = agents.find((a) => a.id === e.target.value);
              updateField('agentId', e.target.value);
              if (agent) {
                onChange({ ...config, agentId: agent.id, agentName: agent.name, model: agent.model });
              }
            }}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="">-- Select agent --</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {nodeType === 'tool' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Skill</label>
          <select
            value={(config.skillId as string) ?? ''}
            onChange={(e) => updateField('skillId', e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="">-- Select skill --</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Function</label>
          <input
            value={(config.functionName as string) ?? ''}
            onChange={(e) => updateField('functionName', e.target.value)}
            placeholder="Function name"
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
        </div>
      )}

      {nodeType === 'condition' && (
        <ConditionBuilder
          value={(config.expression as string) ?? ''}
          onChange={(expr) => updateField('expression', expr)}
        />
      )}

      {nodeType === 'approval' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Timeout (hours)</label>
          <input
            type="number"
            value={(config.timeout as number) ?? 24}
            onChange={(e) => updateField('timeout', Number(e.target.value))}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
            min={1}
          />
        </div>
      )}

      {nodeType === 'end' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Outcome</label>
          <select
            value={(config.outcome as string) ?? 'completed'}
            onChange={(e) => updateField('outcome', e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      )}
    </div>
  );
}
