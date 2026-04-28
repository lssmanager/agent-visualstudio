/**
 * ChartWrapper — contenedor base unificado para todos los charts del dashboard.
 * Gestiona estados: loading (skeleton shimmer), error (inline), empty, y el
 * contenido real. Provee header consistente con title + subtitle + slot derecho.
 *
 * Uso:
 *   <ChartWrapper title="Runs" loading={loading} error={error} empty={!data} height={220}>
 *     <MiChart />
 *   </ChartWrapper>
 */
import type { ReactNode, CSSProperties } from 'react';
import { AlertCircle, BarChart2 } from 'lucide-react';

export interface ChartWrapperProps {
  /** Título del card */
  title: string;
  /** Subtítulo / metadata secundaria (opcional) */
  subtitle?: string;
  /** Estado de carga — muestra skeleton shimmer */
  loading?: boolean;
  /** Error de fetch — muestra mensaje inline */
  error?: string | null;
  /** Sin datos tras fetch exitoso */
  empty?: boolean;
  /** Mensaje personalizado para estado vacío */
  emptyMessage?: string;
  /** Altura fija del área de contenido en px */
  height?: number;
  /** Slot derecho del header (TimeWindowSelector, botones, etc.) */
  headerRight?: ReactNode;
  /** Contenido real del chart */
  children?: ReactNode;
  /** Estilo extra para el card */
  style?: CSSProperties;
}

// ── Skeleton shimmer ─────────────────────────────────────────────────────────

function ChartSkeleton({ height }: { height: number }) {
  return (
    <>
      <style>{`
        @keyframes cw-shimmer {
          0%   { background-position: -400px 0 }
          100% { background-position: 400px 0 }
        }
        .cw-shimmer {
          background: linear-gradient(
            90deg,
            var(--color-surface-offset, #f3f0ec) 25%,
            var(--color-surface-dynamic, #e6e4df) 50%,
            var(--color-surface-offset, #f3f0ec) 75%
          );
          background-size: 800px 100%;
          animation: cw-shimmer 1.6s ease-in-out infinite;
          border-radius: 4px;
        }
      `}</style>
      <div
        className="cw-shimmer"
        style={{ width: '100%', height }}
        role="status"
        aria-label="Cargando datos del gráfico…"
      />
    </>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function ChartEmpty({ height, message }: { height: number; message: string }) {
  return (
    <div
      style={{
        width: '100%',
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--text-faint, #bab9b4)',
      }}
      role="status"
    >
      <BarChart2 size={28} strokeWidth={1.2} />
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  );
}

// ── Error state ──────────────────────────────────────────────────────────────

function ChartError({ height, message }: { height: number; message: string }) {
  return (
    <div
      style={{
        width: '100%',
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--color-error, #a12c7b)',
      }}
      role="alert"
    >
      <AlertCircle size={22} strokeWidth={1.5} />
      <span style={{ fontSize: 11, textAlign: 'center', maxWidth: 200 }}>{message}</span>
    </div>
  );
}

// ── ChartWrapper ─────────────────────────────────────────────────────────────

export function ChartWrapper({
  title,
  subtitle,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'Sin datos para este período',
  height = 220,
  headerRight,
  children,
  style,
}: ChartWrapperProps) {
  return (
    <div
      style={{
        background: 'var(--card-bg, var(--color-surface, #f9f8f5))',
        border: '1px solid var(--border-primary, var(--color-border, #d4d1ca))',
        borderRadius: 'var(--radius-lg, 0.75rem)',
        padding: '14px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 28,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary, #28251d)',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted, #7a7974)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
        {headerRight && (
          <div style={{ flexShrink: 0 }}>
            {headerRight}
          </div>
        )}
      </div>

      {/* Content area */}
      <div style={{ width: '100%' }}>
        {loading ? (
          <ChartSkeleton height={height} />
        ) : error ? (
          <ChartError height={height} message={error} />
        ) : empty ? (
          <ChartEmpty height={height} message={emptyMessage} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
