import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

interface EmptyStateIllustratedProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  badge?: ReactNode;
  context?: string;
}

export function EmptyStateIllustrated({
  icon: Icon,
  title,
  description,
  action,
  badge,
  context,
}: EmptyStateIllustratedProps) {
  return (
    <div
      style={{
        border: '2px dashed var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        background: 'var(--bg-primary)',
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--bg-tertiary)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={28} style={{ color: 'var(--text-muted)' }} />
      </div>

      {badge && <div>{badge}</div>}

      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            color: 'var(--text-muted)',
            maxWidth: '44ch',
            lineHeight: 1.55,
            fontSize: 'var(--text-sm)',
            margin: 0,
          }}
        >
          {description}
        </p>
      )}

      {context && (
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            margin: 0,
            opacity: 0.7,
          }}
        >
          {context}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            color: 'var(--btn-primary-text)',
            background: 'var(--btn-primary-bg)',
            cursor: 'pointer',
            transition: 'background var(--transition)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-bg)'; }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
