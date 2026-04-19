import { ReactNode } from 'react';

interface DashboardWidgetProps {
  title: string;
  chip?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function DashboardWidget({ title, chip, actions, children }: DashboardWidgetProps) {
  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--card-border)',
        background: 'var(--card-bg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-heading)',
            }}
          >
            {title}
          </span>
          {chip && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-primary-soft)',
                color: 'var(--color-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {chip}
            </span>
          )}
        </div>
        {actions && <div>{actions}</div>}
      </div>

      {/* Body */}
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
