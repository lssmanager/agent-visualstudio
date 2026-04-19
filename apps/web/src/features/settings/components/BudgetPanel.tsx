import { useEffect, useState } from 'react';
import { DollarSign, Plus } from 'lucide-react';

import { getBudgets, createBudget } from '../../../lib/api';

interface BudgetSpec {
  id: string;
  name: string;
  scope: 'workspace' | 'agent' | 'model';
  targetId?: string;
  limitUsd: number;
  periodDays: number;
  currentUsageUsd: number;
  enabled: boolean;
}

export function BudgetPanel() {
  const [budgets, setBudgets] = useState<BudgetSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'workspace' | 'agent' | 'model'>('workspace');
  const [limitUsd, setLimitUsd] = useState(100);
  const [periodDays, setPeriodDays] = useState(30);

  async function load() {
    try {
      setBudgets(await getBudgets());
    } catch {
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    await createBudget({ name, scope, limitUsd, periodDays, enabled: true });
    setCreating(false);
    setName('');
    await load();
  }

  if (loading) {
    return <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading budgets...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Budgets</h3>
        <button
          onClick={() => setCreating(!creating)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={12} /> New Budget
        </button>
      </div>

      {creating && (
        <div
          className="rounded border p-3 space-y-2"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Budget name"
            className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-primary)' }} />
          <div className="grid grid-cols-3 gap-2">
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}
              className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-primary)' }}>
              <option value="workspace">Workspace</option>
              <option value="agent">Agent</option>
              <option value="model">Model</option>
            </select>
            <input type="number" value={limitUsd} onChange={(e) => setLimitUsd(Number(e.target.value))}
              placeholder="Limit ($)" className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-primary)' }} />
            <input type="number" value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}
              placeholder="Period (days)" className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-primary)' }} />
          </div>
          <button onClick={handleCreate} className="rounded px-3 py-1 text-xs font-medium text-white"
            style={{ background: 'var(--color-primary)' }}>Create</button>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          No budgets configured. Set spending limits per workspace, agent, or model.
        </div>
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => {
            const pct = b.limitUsd > 0 ? Math.min((b.currentUsageUsd / b.limitUsd) * 100, 100) : 0;
            return (
              <div key={b.id} className="rounded border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{b.scope}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pct}%`,
                      background: pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#059669',
                    }} />
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    ${b.currentUsageUsd.toFixed(2)} / ${b.limitUsd.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
