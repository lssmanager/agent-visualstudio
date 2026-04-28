/**
 * ChartWrapper
 * Wrapper unificado con estados loading / error / empty para cualquier chart.
 * Uso: <ChartWrapper loading={} error={} empty={!data?.length} title="">
 *        <RechartsComponent />
 *      </ChartWrapper>
 */
import type { ReactNode } from 'react';
import { Loader2, AlertCircle, BarChart3 } from 'lucide-react';

interface ChartWrapperProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  height?: number;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function ChartWrapper({
  title,
  subtitle,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'Sin datos para el período seleccionado',
  height = 220,
  headerRight,
  children,
}: ChartWrapperProps) {
  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</p>
          {subtitle && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{subtitle}</p>
          )}
        </div>
        {headerRight && <div>{headerRight}</div>}
      </div>

      {/* Body */}
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12 }}>Cargando…</span>
          </div>
        )}
        {!loading && error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--color-error, #c0392b)' }}>
            <AlertCircle size={20} />
            <span style={{ fontSize: 12 }}>{error}</span>
          </div>
        )}
        {!loading && !error && empty && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
            <BarChart3 size={20} />
            <span style={{ fontSize: 12 }}>{emptyMessage}</span>
          </div>
        )}
        {!loading && !error && !empty && (
          <div style={{ width: '100%', height: '100%' }}>{children}</div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
