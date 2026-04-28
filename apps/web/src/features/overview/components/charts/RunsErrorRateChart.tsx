/**
 * RunsErrorRateChart — OV-02
 * Bar chart apilado: runs completados (verde) + fallidos (rojo).
 * Línea de tasa de error superpuesta en eje Y secundario.
 */
import { useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ChartWrapper } from '../shared/ChartWrapper';
import { TimeWindowSelector } from '../shared/TimeWindowSelector';
import { useRunsTimeline } from '../../../../lib/useDashboard';

function fmt(ts: string) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}h`;
}

export function RunsErrorRateChart() {
  const [win, setWin] = useState('7d');
  const { data, loading, error } = useRunsTimeline(win, win === '1h' ? '5m' : win === '24h' ? '1h' : '6h');

  const chartData = (data?.buckets ?? []).map((b) => ({
    ts: fmt(b.ts),
    completados: b.completed,
    fallidos: b.failed,
    errorRate: b.total > 0 ? parseFloat(((b.failed / b.total) * 100).toFixed(1)) : 0,
  }));

  return (
    <ChartWrapper
      title="Runs / Tasa de error"
      subtitle="Volumen de ejecuciones y % error por período"
      loading={loading}
      error={error}
      empty={chartData.length === 0}
      height={220}
      headerRight={<TimeWindowSelector value={win} onChange={setWin} />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 36, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(v: number, name: string) => name === 'errorRate' ? [`${v}%`, 'Error rate'] : [v, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="completados" stackId="a" fill="var(--color-success, #437a22)" radius={[0, 0, 0, 0]} maxBarSize={28} />
          <Bar yAxisId="left" dataKey="fallidos" stackId="a" fill="var(--color-error, #a12c7b)" radius={[2, 2, 0, 0]} maxBarSize={28} />
          <Line yAxisId="right" type="monotone" dataKey="errorRate" stroke="var(--color-warning, #964219)" strokeWidth={2} dot={false} name="errorRate" />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
