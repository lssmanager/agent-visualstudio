/**
 * KpiSparklineCards — OV-01
 * 6 tarjetas KPI con sparkline inline (AreaChart 32px de alto).
 * Datos: /dashboard/metrics/kpis + /dashboard/metrics/runs (sparkline)
 */
import { Activity, Bot, DollarSign, TrendingUp, Zap, Clock } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import type { KpisResponse, RunsBucket } from '../../../../lib/dashboard-api';

interface KpiSparklineCardsProps {
  kpis: KpisResponse | null;
  sparkData?: RunsBucket[];
  loading?: boolean;
}

interface CardDef {
  label: string;
  value: string;
  sub: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
  icon: React.ReactNode;
  sparkKey: keyof RunsBucket;
}

function SparkArea({ data, dataKey, color }: { data: RunsBucket[]; dataKey: keyof RunsBucket; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Area type="monotone" dataKey={dataKey as string} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={1.5} dot={false} />
        <Tooltip
          contentStyle={{ display: 'none' }}
          cursor={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const TONES: Record<string, string> = {
  neutral: 'var(--color-primary, #01696f)',
  success: 'var(--color-success, #437a22)',
  warning: 'var(--color-warning, #964219)',
  error: 'var(--color-error, #a12c7b)',
};

export function KpiSparklineCards({ kpis, sparkData = [], loading = false }: KpiSparklineCardsProps) {
  if (loading || !kpis) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 90,
              background: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-lg)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      </div>
    );
  }

  const successTone = kpis.successRate >= 90 ? 'success' : kpis.successRate >= 70 ? 'warning' : 'error';

  const cards: CardDef[] = [
    {
      label: 'Runs (24h)',
      value: String(kpis.totalRuns),
      sub: `${kpis.completedRuns} completados`,
      tone: 'neutral',
      icon: <Activity size={14} />,
      sparkKey: 'total',
    },
    {
      label: 'Tasa éxito',
      value: `${kpis.successRate}%`,
      sub: `${kpis.successRateDelta >= 0 ? '+' : ''}${kpis.successRateDelta}% vs ayer`,
      tone: successTone,
      icon: <TrendingUp size={14} />,
      sparkKey: 'completed',
    },
    {
      label: 'Costo (24h)',
      value: `$${kpis.costUsd.toFixed(4)}`,
      sub: `${kpis.tokens.toLocaleString()} tokens`,
      tone: 'neutral',
      icon: <DollarSign size={14} />,
      sparkKey: 'total',
    },
    {
      label: 'Errores (24h)',
      value: String(kpis.failedRuns),
      sub: `${kpis.totalRuns > 0 ? ((kpis.failedRuns / kpis.totalRuns) * 100).toFixed(1) : 0}% tasa error`,
      tone: kpis.failedRuns === 0 ? 'success' : kpis.failedRuns < 3 ? 'warning' : 'error',
      icon: <Zap size={14} />,
      sparkKey: 'failed',
    },
    {
      label: 'Agentes activos',
      value: String(kpis.activeAgents),
      sub: 'en ejecución ahora',
      tone: 'neutral',
      icon: <Bot size={14} />,
      sparkKey: 'total',
    },
    {
      label: 'Latencia P95',
      value: kpis.latencyP95Ms > 0 ? `${(kpis.latencyP95Ms / 1000).toFixed(1)}s` : '—',
      sub: `P50: ${kpis.latencyP50Ms > 0 ? `${(kpis.latencyP50Ms / 1000).toFixed(1)}s` : '—'}`,
      tone: kpis.latencyP95Ms > 60_000 ? 'warning' : 'neutral',
      icon: <Clock size={14} />,
      sparkKey: 'total',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 14px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: TONES[card.tone] }}>
            {card.icon}
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {card.label}
            </span>
          </div>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
            {card.value}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{card.sub}</p>
          {sparkData.length > 1 && (
            <div style={{ marginTop: 4 }}>
              <SparkArea data={sparkData} dataKey={card.sparkKey} color={TONES[card.tone]} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
