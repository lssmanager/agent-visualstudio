interface CostGroup {
  key: string;
  cost: number;
  tokens: { input: number; output: number };
  runs: number;
}

interface CostChartProps {
  groups: CostGroup[];
  totalCost: number;
}

export function CostChart({ groups, totalCost }: CostChartProps) {
  if (groups.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No usage data available.</p>
      </div>
    );
  }

  const maxCost = Math.max(...groups.map((g) => g.cost), 0.001);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold font-heading" style={{ color: 'var(--text-primary)' }}>
          ${totalCost.toFixed(4)}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>total cost</span>
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          const pct = maxCost > 0 ? (group.cost / maxCost) * 100 : 0;
          return (
            <div key={group.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
                  {group.key}
                </span>
                <span className="flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                  <span>{group.runs} run{group.runs !== 1 ? 's' : ''}</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    ${group.cost.toFixed(4)}
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(pct, 1)}%`, background: 'var(--color-primary)' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
