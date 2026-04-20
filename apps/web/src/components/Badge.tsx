import { ReactNode } from 'react';

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'default';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  success: {
    bg: 'var(--tone-success-bg)',
    color: 'var(--color-success)',
    border: 'var(--tone-success-border)',
  },
  error: {
    bg: 'var(--tone-danger-bg)',
    color: 'var(--color-error)',
    border: 'var(--tone-danger-border)',
  },
  warning: {
    bg: 'var(--tone-warning-bg)',
    color: 'var(--color-warning)',
    border: 'var(--tone-warning-border)',
  },
  info: {
    bg: 'var(--color-primary-soft)',
    color: 'var(--color-primary)',
    border: 'var(--color-primary-soft)',
  },
  default: {
    bg: 'var(--bg-tertiary)',
    color: 'var(--text-muted)',
    border: 'var(--border-primary)',
  },
};

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const s = variantStyles[variant];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {children}
    </span>
  );
}
