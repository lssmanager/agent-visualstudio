/**
 * ModelMixDonut — OV-06
 * Donut chart de distribución de costo por modelo LLM.
 * Lista lateral con porcentajes y número de llamadas.
 */
import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartWrapper } from '../shared/ChartWrapper';
import { TimeWindowSelector } from '../shared/TimeWindowSelector';
import { useModelMix } from '../../../../lib/useDashboard';

const PALETTE = [
  'var(--color-primary, #01696f)',
  'var(--color-blue, #006494)',
  'var(--color-gold, #d19900)',
  'var(--color-warning, #964219)',
  'var(--color-purple, #7a39bb)',
  'var(--color-success, #437a22)',
];

export function ModelMixDonut() {
  const [win, setWin] = useState('7d');
  const { data, loading, error } = useModelMix(win);

  const models = data?.models ?? [];

  return (
    <ChartWrapper
      title="Mix de modelos"
      subtitle={data ? `$${data.totalCostUsd.toFixed(4)} total` : ''}
      loading={loading}
      error={error}
      empty={models.length === 0}
      height={220}
      headerRight={<TimeWindowSelector value={win} onChange={setWin} />}
    >
      <div style={{ display: 'flex', gap: 16, width: '100%', height: '100%', alignItems: 'center' }}>
        {/* Donut */}
        <div style={{ flex: '0 0 140px', height: 140 }}>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={models}
                dataKey="costUsd"
                nameKey="model"
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={60}
                strokeWidth={2}
                stroke="var(--card-bg)"
              >
                {models.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 6,
                  fontSize: 11,
                }}
                formatter={(v: number, name: string) => [`$${v.toFixed(4)}`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Leyenda */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          {models.slice(0, 6).map((m, i) => (
            <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: PALETTE[i % PALETTE.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.model}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {m.sharePct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartWrapper>
  );
}
