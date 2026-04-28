/**
 * LatencyBarsChart — OV-09
 * Barras horizontales agrupadas P50 / P95 por flow o agente.
 */
import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ChartWrapper } from '../shared/ChartWrapper';
import { TimeWindowSelector } from '../shared/TimeWindowSelector';
import { useLatency } from '../../../../lib/useDashboard';

function fmtMs(ms: number) {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function LatencyBarsChart() {
  const [win, setWin] = useState('7d');
  const { data, loading, error } = useLatency(win, 'flow');

  const chartData = (data?.groups ?? [])
    .slice(0, 8)
    .map((g) => ({
      name: g.key.length > 16 ? g.key.slice(0, 14) + '…' : g.key,
      P50: g.p50Ms,
      P95: g.p95Ms,
    }));

  const overall = data?.overall;

  return (
    <ChartWrapper
      title="Latencia por flow"
      subtitle={
        overall
          ? `Global — P50: ${fmtMs(overall.p50Ms)}  P95: ${fmtMs(overall.p95Ms)}  P99: ${fmtMs(overall.p99Ms)}`
          : ''
      }
      loading={loading}
      error={error}
      empty={chartData.length === 0}
      height={220}
      headerRight={<TimeWindowSelector value={win} onChange={setWin} />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={fmtMs}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={80}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(v: number, name: string) => [fmtMs(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="P50" fill="var(--color-primary, #01696f)" radius={[0, 2, 2, 0]} maxBarSize={14} />
          <Bar dataKey="P95" fill="var(--color-warning, #964219)" radius={[0, 2, 2, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
