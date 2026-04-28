/**
 * BudgetGauge — OV-05
 * Gauge semicircular SVG para la política de presupuesto más restrictiva.
 * Complementado con tabla de políticas.
 */
import { useBudgetStatus } from '../../../../lib/useDashboard';
import { ChartWrapper } from '../shared/ChartWrapper';
import type { PolicyStatus } from '../../../../lib/dashboard-api';

const STATUS_COLOR: Record<PolicyStatus['status'], string> = {
  ok: 'var(--color-success, #437a22)',
  warning: 'var(--color-warning, #964219)',
  critical: 'var(--color-error, #a12c7b)',
  exceeded: '#c0392b',
};

function SemiGauge({ pct, color }: { pct: number; color: string }) {
  const r = 52;
  const cx = 70;
  const cy = 70;
  const circumference = Math.PI * r; // semicircle
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = (clamped / 100) * circumference;

  return (
    <svg viewBox="0 0 140 80" width="140" height="80" aria-label={`${clamped}% utilización`}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="var(--border-primary)"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Fill */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--text-primary)" fontVariantNumeric="tabular-nums">
        {clamped.toFixed(0)}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="var(--text-muted)">utilización</text>
    </svg>
  );
}

export function BudgetGauge() {
  const { data, loading, error } = useBudgetStatus(30_000);

  const topPolicy = data?.policies[0] ?? null;

  return (
    <ChartWrapper
      title="Presupuesto"
      subtitle={topPolicy ? `Política: ${topPolicy.name}` : 'Sin políticas configuradas'}
      loading={loading}
      error={error}
      empty={!topPolicy}
      emptyMessage="No hay políticas de presupuesto"
      height={200}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', height: '100%', paddingTop: 8 }}>
        {topPolicy && (
          <SemiGauge pct={topPolicy.utilizationPct} color={STATUS_COLOR[topPolicy.status]} />
        )}
        {/* Tabla de todas las políticas */}
        {data && data.policies.length > 0 && (
          <div style={{ width: '100%', overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Política</th>
                  <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Gasto</th>
                  <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Límite</th>
                  <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.policies.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                    <td style={{ padding: '4px 6px', color: 'var(--text-primary)' }}>{p.name}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${p.spentUsd.toFixed(4)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${p.limitUsd.toFixed(2)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 600,
                          background: STATUS_COLOR[p.status] + '22',
                          color: STATUS_COLOR[p.status],
                        }}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ChartWrapper>
  );
}
