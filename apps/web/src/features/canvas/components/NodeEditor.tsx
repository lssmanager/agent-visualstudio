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
        <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Edit Node</h4>
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

      {/* ── Trigger ─────────────────────────────────────────────────────── */}
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
            <option value="n8n">n8n Trigger</option>
          </select>
          {config.triggerType === 'schedule' && (
            <input
              value={(config.schedule as string) ?? ''}
              onChange={(e) => updateField('schedule', e.target.value)}
              placeholder="Cron (e.g. 0 9 * * *)"
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
          {config.triggerType === 'n8n' && (
            <input
              value={(config.n8nWorkflowId as string) ?? ''}
              onChange={(e) => updateField('n8nWorkflowId', e.target.value)}
              placeholder="n8n workflow ID"
              className="w-full rounded border px-2 py-1 text-xs font-mono"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
            />
          )}
        </div>
      )}

      {/* ── Agent ────────────────────────────────────────────────────────── */}
      {(nodeType === 'agent' || nodeType === 'subagent') && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Agent</label>
          <select
            value={(config.agentId as string) ?? ''}
            onChange={(e) => {
              const agent = agents.find((a) => a.id === e.target.value);
              updateField('agentId', e.target.value);
              if (agent) onChange({ ...config, agentId: agent.id, agentName: agent.name, model: agent.model });
            }}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="">-- Select agent --</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {config.agentName && (
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              model: <span className="font-mono">{(config.model as string) ?? '\u2014'}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Supervisor ───────────────────────────────────────────────────── */}
      {nodeType === 'supervisor' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Supervisor Agent</label>
          <select
            value={(config.agentId as string) ?? ''}
            onChange={(e) => {
              const agent = agents.find((a) => a.id === e.target.value);
              if (agent) onChange({ ...config, agentId: agent.id, agentName: agent.name });
            }}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="">-- Select supervisor --</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Delegation Mode</label>
          <select
            value={(config.delegationMode as string) ?? 'llm_router'}
            onChange={(e) => updateField('delegationMode', e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="llm_router">LLM Router</option>
            <option value="round_robin">Round Robin</option>
            <option value="priority">Priority</option>
          </select>
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Max Iterations</label>
          <input
            type="number"
            value={(config.maxIterations as number) ?? 10}
            onChange={(e) => updateField('maxIterations', Number(e.target.value))}
            min={1} max={100}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
        </div>
      )}

      {/* ── Tool / Skill ─────────────────────────────────────────────────── */}
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
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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

      {/* ── Condition ────────────────────────────────────────────────────── */}
      {nodeType === 'condition' && (
        <ConditionBuilder
          value={(config.expression as string) ?? ''}
          onChange={(expr) => updateField('expression', expr)}
        />
      )}

      {/* ── Approval ─────────────────────────────────────────────────────── */}
      {nodeType === 'approval' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Approval Role</label>
          <select
            value={(config.approvalRole as string) ?? 'operator'}
            onChange={(e) => updateField('approvalRole', e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="operator">Operator</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Timeout (hours)</label>
          <input
            type="number"
            value={Math.round(((config.timeoutMs as number) ?? 300000) / 3_600_000)}
            onChange={(e) => updateField('timeoutMs', Number(e.target.value) * 3_600_000)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
            min={1}
          />
        </div>
      )}

      {/* ── Sub-Flow ─────────────────────────────────────────────────────── */}
      {nodeType === 'subflow' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Sub-Flow ID</label>
          <input
            value={(config.subFlowId as string) ?? ''}
            onChange={(e) => updateField('subFlowId', e.target.value)}
            placeholder="flow-id or slug"
            className="w-full rounded border px-2 py-1 text-xs font-mono"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Display Label</label>
          <input
            value={(config.label as string) ?? ''}
            onChange={(e) => updateField('label', e.target.value)}
            placeholder="Human-readable name"
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
          <label className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={(config.passthrough as boolean) ?? false}
              onChange={(e) => updateField('passthrough', e.target.checked)}
            />
            Pass parent context through sub-flow
          </label>
        </div>
      )}

      {/* ── End ──────────────────────────────────────────────────────────── */}
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

      {/* ── n8n Webhook ──────────────────────────────────────────────────── */}
      {nodeType === 'n8n_webhook' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Webhook Path</label>
          <input
            value={(config.webhookPath as string) ?? '/hook'}
            onChange={(e) => updateField('webhookPath', e.target.value)}
            placeholder="/my-hook"
            className="w-full rounded border px-2 py-1 text-xs font-mono"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Method</label>
          <select
            value={(config.method as string) ?? 'POST'}
            onChange={(e) => updateField('method', e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>DELETE</option>
          </select>
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>n8n Workflow ID (optional)</label>
          <input
            value={(config.workflowId as string) ?? ''}
            onChange={(e) => updateField('workflowId', e.target.value)}
            placeholder="abc123"
            className="w-full rounded border px-2 py-1 text-xs font-mono"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
          <label className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={(config.waitForResponse as boolean) ?? false}
              onChange={(e) => updateField('waitForResponse', e.target.checked)}
            />
            Wait for n8n response
          </label>
        </div>
      )}

      {/* ── n8n Workflow ─────────────────────────────────────────────────── */}
      {nodeType === 'n8n_workflow' && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Label (display name)
          </label>
          <input
            value={(config.label as string) ?? ''}
            onChange={(e) => updateField('label', e.target.value)}
            placeholder="My Workflow"
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />

          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Workflow ID
          </label>
          <input
            value={(config.workflowId as string) ?? ''}
            onChange={(e) => updateField('workflowId', e.target.value)}
            placeholder="n8n workflow ID"
            className="w-full rounded border px-2 py-1 text-xs font-mono"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />

          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Trigger Mode
          </label>
          <select
            value={(config.triggerMode as string) ?? 'webhook'}
            onChange={(e) => updateField('triggerMode', e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <option value="webhook">Webhook</option>
            <option value="schedule">Schedule</option>
            <option value="manual">Manual</option>
          </select>

          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Input Mapping (JSON)
          </label>
          <textarea
            value={
              typeof config.inputMapping === 'object'
                ? JSON.stringify(config.inputMapping, null, 2)
                : ((config.inputMapping as string) ?? '{}')
            }
            onChange={(e) => {
              try {
                updateField('inputMapping', JSON.parse(e.target.value));
              } catch {
                // allow partial editing
              }
            }}
            placeholder='{ "agentOutput": "$.body.result" }'
            rows={3}
            className="w-full rounded border px-2 py-1 text-[10px] font-mono resize-none"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />

          <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Output Mapping (JSON)
          </label>
          <textarea
            value={
              typeof config.outputMapping === 'object'
                ? JSON.stringify(config.outputMapping, null, 2)
                : ((config.outputMapping as string) ?? '{}')
            }
            onChange={(e) => {
              try {
                updateField('outputMapping', JSON.parse(e.target.value));
              } catch {
                // allow partial editing
              }
            }}
            placeholder='{ "result": "$.body.data" }'
            rows={3}
            className="w-full rounded border px-2 py-1 text-[10px] font-mono resize-none"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />

          <label className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={(config.waitForResult as boolean) ?? false}
              onChange={(e) => updateField('waitForResult', e.target.checked)}
            />
            Wait for workflow result (sync)
          </label>
        </div>
      )}
    </div>
  );
}
