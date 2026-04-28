/**
 * TokensStackedArea — OV-03
 * Área apilada: tokens de entrada (azul claro) + salida (teal).
 * Eje Y secundario con costo en USD.
 */
import { useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ChartWrapper } from '../shared/ChartWrapper';
import { TimeWindowSelector } from '../shared/TimeWindowSelector';
import { useTokensTimeline } from '../../../../lib/useDashboard';

function fmt(ts: string) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}h`;
}

function fmtK(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function TokensStackedArea() {
  const [win, setWin] = useState('7d');
  const { data, loading, error } = useTokensTimeline(win, win === '1h' ? '5m' : win === '24h' ? '1h' : '6h');

  const chartData = (data?.buckets ?? []).map((b) => ({
    ts: fmt(b.ts),
    entrada: b.inputTokens,
    salida: b.outputTokens,
    costoUsd: b.costUsd,
  }));

  return (
    <ChartWrapper
      title="Tokens"
      subtitle={data ? `Total período: ${fmtK(data.totals.inputTokens + data.totals.outputTokens)} tokens · $${data.totals.costUsd.toFixed(4)}` : ''}
      loading={loading}
      error={error}
      empty={chartData.length === 0}
      height={220}
      headerRight={<TimeWindowSelector value={win} onChange={setWin} />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${v.toFixed(3)}`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(v: number, name: string) =>
              name === 'costoUsd' ? [`$${v.toFixed(4)}`, 'Costo USD'] : [fmtK(v), name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area yAxisId="left" type="monotone" dataKey="entrada" stackId="t" stroke="var(--color-blue, #006494)" fill="var(--color-blue, #006494)" fillOpacity={0.2} strokeWidth={1.5} dot={false} name="entrada" />
          <Area yAxisId="left" type="monotone" dataKey="salida" stackId="t" stroke="var(--color-primary, #01696f)" fill="var(--color-primary, #01696f)" fillOpacity={0.3} strokeWidth={1.5} dot={false} name="salida" />
          <Line yAxisId="right" type="monotone" dataKey="costoUsd" stroke="var(--color-gold, #d19900)" strokeWidth={1.5} dot={false} name="costoUsd" />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
