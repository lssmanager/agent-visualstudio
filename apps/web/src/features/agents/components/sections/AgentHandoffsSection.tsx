import type { AgentSpec } from '../../../../lib/types';

type Props = {
  value: AgentSpec;
  availableTargets?: Array<{ id: string; name: string }>;
  onChange: (next: AgentSpec) => void;
};

const DEFAULT_INTERNAL = ['read files', 'explore workspace', 'organize memory', 'search web', 'check git status', 'update docs'];
const DEFAULT_EXTERNAL = ['send email', 'post tweet', 'publish content', 'run destructive commands', 'exfiltrate data'];

export function AgentHandoffsSection({ value, onChange, availableTargets = [] }: Props) {
  const handoffs = value.handoffs ?? {
    allowedTargets: [],
    fallbackAgent: '',
    escalationPolicy: '',
    approvalLane: '',
    delegationNotes: '',
    internalActionsAllowed: DEFAULT_INTERNAL,
    externalActionsRequireApproval: DEFAULT_EXTERNAL,
    publicPostingRequiresApproval: true,
  };

  const update = (patch: Partial<typeof handoffs>) => {
    onChange({ ...value, handoffs: { ...handoffs, ...patch } });
  };

  const currentTargets = handoffs.allowedTargets ?? [];
  const addTarget = (id: string) => update({ allowedTargets: [...currentTargets, id] });
  const removeTarget = (id: string) => update({ allowedTargets: currentTargets.filter((t) => t !== id) });

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Handoffs</h3>

      {/* Allowed targets — chip multi-select */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase opacity-60">Allowed Targets</p>
        <div
          className="rounded-md border p-2 flex flex-wrap gap-1.5 min-h-[2.5rem] items-start"
          style={{ background: 'var(--bg-secondary)' }}
        >
          {currentTargets.map((targetId) => {
            const target = availableTargets.find((t) => t.id === targetId);
            return (
              <span
                key={targetId}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}
              >
                {target?.name ?? targetId}
                <button
                  type="button"
                  className="hover:opacity-60 transition-opacity leading-none"
                  onClick={() => removeTarget(targetId)}
                >
                  ×
                </button>
              </span>
            );
          })}
          {availableTargets
            .filter((t) => !currentTargets.includes(t.id))
            .map((target) => (
              <button
                key={target.id}
                type="button"
                className="rounded-full px-2.5 py-0.5 text-xs border transition-colors hover:border-current"
                style={{ borderStyle: 'dashed', color: 'var(--text-muted)' }}
                onClick={() => addTarget(target.id)}
              >
                + {target.name}
              </button>
            ))}
          {availableTargets.length === 0 && currentTargets.length === 0 && (
            <span className="text-xs opacity-40 p-0.5">No other agents in workspace</span>
          )}
        </div>
      </div>

      {/* Fallback agent */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase opacity-60">Fallback Agent</p>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={handoffs.fallbackAgent ?? ''}
          onChange={(e) => update({ fallbackAgent: e.target.value })}
        >
          <option value="">None</option>
          {availableTargets.map((target) => (
            <option key={target.id} value={target.id}>{target.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase opacity-60">Escalation Policy</p>
          <textarea
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={handoffs.escalationPolicy ?? ''}
            onChange={(e) => update({ escalationPolicy: e.target.value })}
            placeholder="When should this agent escalate?"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase opacity-60">Approval Lane</p>
          <textarea
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={handoffs.approvalLane ?? ''}
            onChange={(e) => update({ approvalLane: e.target.value })}
            placeholder="Which actions require human approval?"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase opacity-60">Internal Actions Allowed</p>
          <textarea
            rows={5}
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={(handoffs.internalActionsAllowed ?? DEFAULT_INTERNAL).join('\n')}
            onChange={(e) =>
              update({ internalActionsAllowed: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })
            }
            placeholder="one action per line"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase opacity-60">External Actions (require approval)</p>
          <textarea
            rows={5}
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={(handoffs.externalActionsRequireApproval ?? DEFAULT_EXTERNAL).join('\n')}
            onChange={(e) =>
              update({ externalActionsRequireApproval: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })
            }
            placeholder="one action per line"
          />
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(handoffs.publicPostingRequiresApproval)}
          onChange={(e) => update({ publicPostingRequiresApproval: e.target.checked })}
        />
        Public posting requires approval
      </label>
    </section>
  );
}
