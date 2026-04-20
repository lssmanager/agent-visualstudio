import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface StudioPageShellProps {
  children: ReactNode;
  maxWidth?: number;
}

export function StudioPageShell({ children, maxWidth = 1460 }: StudioPageShellProps) {
  return (
    <div
      style={{
        maxWidth,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

interface StudioHeroSectionProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function StudioHeroSection({ eyebrow, title, description, actions, meta }: StudioHeroSectionProps) {
  return (
    <section
      style={{
        borderRadius: 'var(--radius-2xl)',
        border: '1px solid var(--shell-panel-border)',
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--shell-chip-bg) 82%, transparent), color-mix(in srgb, var(--shell-panel-bg) 90%, transparent))',
        boxShadow: 'var(--shadow-md)',
        padding: '18px 20px',
        display: 'grid',
        gap: 14,
      }}
    >
      {eyebrow && (
        <span
          style={{
            display: 'inline-flex',
            width: 'fit-content',
            borderRadius: 'var(--radius-full)',
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-primary)',
            background: 'var(--color-primary-soft)',
            border: '1px solid color-mix(in srgb, var(--color-primary) 34%, transparent)',
          }}
        >
          {eyebrow}
        </span>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', lineHeight: 1.06 }}>{title}</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', maxWidth: 880 }}>{description}</p>
      </div>

      {(actions || meta) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>
          {meta}
        </div>
      )}
    </section>
  );
}

interface StudioSectionCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function StudioSectionCard({ title, description, actions, children }: StudioSectionCardProps) {
  return (
    <section
      style={{
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--shell-panel-border)',
        background: 'var(--shell-panel-bg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--shell-panel-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'grid', gap: 2 }}>
          <h2 style={{ fontSize: 16 }}>{title}</h2>
          {description && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{description}</p>}
        </div>
        {actions}
      </header>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

interface StudioKpiCardProps {
  label: string;
  value: string | number;
  helper?: string;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning';
  onClick?: () => void;
}

const KPI_TONES: Record<NonNullable<StudioKpiCardProps['tone']>, CSSProperties> = {
  default: {
    borderColor: 'var(--shell-panel-border)',
    background: 'var(--shell-panel-bg)',
  },
  success: {
    borderColor: 'var(--tone-success-border)',
    background: 'var(--tone-success-bg)',
  },
  warning: {
    borderColor: 'var(--tone-warning-border)',
    background: 'var(--tone-warning-bg)',
  },
};

export function StudioKpiCard({ label, value, helper, icon, tone = 'default', onClick }: StudioKpiCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...KPI_TONES[tone],
        textAlign: 'left',
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        padding: 14,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
        <div style={{ display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 800 }}>
            {label}
          </span>
          <strong style={{ fontSize: 26, lineHeight: 1.05, color: 'var(--text-primary)' }}>{value}</strong>
          {helper && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{helper}</span>}
        </div>
        {icon && <div style={{ color: 'var(--text-secondary)', opacity: 0.92 }}>{icon}</div>}
      </div>
    </button>
  );
}

interface RuntimeStatusBadgeProps {
  status: 'online' | 'degraded' | 'offline' | 'idle';
  label: string;
}

export function RuntimeStatusBadge({ status, label }: RuntimeStatusBadgeProps) {
  const map: Record<RuntimeStatusBadgeProps['status'], CSSProperties> = {
    online: { background: 'var(--tone-success-bg)', borderColor: 'var(--tone-success-border)', color: 'var(--tone-success-text)' },
    degraded: { background: 'var(--tone-warning-bg)', borderColor: 'var(--tone-warning-border)', color: 'var(--tone-warning-text)' },
    offline: { background: 'var(--tone-danger-bg)', borderColor: 'var(--tone-danger-border)', color: 'var(--tone-danger-text)' },
    idle: { background: 'var(--shell-chip-bg)', borderColor: 'var(--shell-chip-border)', color: 'var(--text-muted)' },
  };

  return (
    <span
      style={{
        ...map[status],
        borderRadius: 'var(--radius-full)',
        borderWidth: 1,
        borderStyle: 'solid',
        padding: '6px 11px',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

interface StudioMetricRowProps {
  label: string;
  value: string;
  hint?: string;
}

export function StudioMetricRow({ label, value, hint }: StudioMetricRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        borderBottom: '1px solid var(--shell-chip-border)',
        padding: '10px 0',
      }}
    >
      <div style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hint}</span>}
      </div>
      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</strong>
    </div>
  );
}

interface StudioEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StudioEmptyState({ title, description, actionLabel, onAction }: StudioEmptyStateProps) {
  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--shell-chip-border)',
        background: 'var(--shell-chip-bg)',
        padding: 18,
        textAlign: 'center',
        display: 'grid',
        gap: 10,
      }}
    >
      <h3 style={{ fontSize: 16 }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            margin: '0 auto',
            border: '1px solid var(--shell-chip-border)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            background: 'var(--shell-chip-bg)',
            fontSize: 12,
            color: 'var(--text-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          {actionLabel}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

interface StudioInspectorCardProps {
  title: string;
  children: ReactNode;
}

export function StudioInspectorCard({ title, children }: StudioInspectorCardProps) {
  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--shell-chip-border)',
        background: 'var(--shell-chip-bg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--shell-chip-border)',
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {title}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

interface StudioTimelineBlockProps {
  items: Array<{ title: string; description: string; meta?: string }>;
}

export function StudioTimelineBlock({ items }: StudioTimelineBlockProps) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 10 }}>
          <div style={{ display: 'grid', placeItems: 'start center' }}>
            <span style={{ width: 8, height: 8, marginTop: 5, borderRadius: '50%', background: 'var(--color-primary)' }} />
          </div>
          <div style={{ paddingBottom: 10, borderBottom: index === items.length - 1 ? 'none' : '1px solid var(--shell-chip-border)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>{item.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{item.description}</p>
            {item.meta && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{item.meta}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

interface StudioDiffBlockProps {
  status: 'added' | 'updated' | 'deleted' | 'unchanged';
  title: string;
  description: string;
}

export function StudioDiffBlock({ status, title, description }: StudioDiffBlockProps) {
  const tone =
    status === 'added'
      ? { border: 'var(--tone-success-border)', background: 'var(--tone-success-bg)', color: 'var(--tone-success-text)' }
      : status === 'updated'
        ? { border: 'var(--tone-warning-border)', background: 'var(--tone-warning-bg)', color: 'var(--tone-warning-text)' }
        : status === 'deleted'
          ? { border: 'var(--tone-danger-border)', background: 'var(--tone-danger-bg)', color: 'var(--tone-danger-text)' }
          : { border: 'var(--shell-chip-border)', background: 'var(--shell-chip-bg)', color: 'var(--text-muted)' };

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${tone.border}`,
        background: tone.background,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: tone.color }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{description}</div>
    </div>
  );
}

interface StudioCommandRowProps {
  children: ReactNode;
}

export function StudioCommandRow({ children }: StudioCommandRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}
