import { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';

type AlertVariant = 'info' | 'warning' | 'error' | 'success';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const variantConfig: Record<
  AlertVariant,
  {
    bg: string;
    border: string;
    accent: string;
    text: string;
    title: string;
    icon: typeof Info;
  }
> = {
  info: {
    bg: 'var(--color-primary-soft)',
    border: 'var(--color-primary-soft)',
    accent: 'var(--color-primary)',
    text: 'var(--color-primary)',
    title: 'var(--color-primary-active)',
    icon: Info,
  },
  warning: {
    bg: 'var(--tone-warning-bg)',
    border: 'var(--tone-warning-border)',
    accent: 'var(--color-warning)',
    text: 'var(--tone-warning-text)',
    title: 'var(--color-warning)',
    icon: AlertTriangle,
  },
  error: {
    bg: 'var(--tone-danger-bg)',
    border: 'var(--tone-danger-border)',
    accent: 'var(--color-error)',
    text: 'var(--tone-danger-text)',
    title: 'var(--color-error)',
    icon: AlertCircle,
  },
  success: {
    bg: 'var(--tone-success-bg)',
    border: 'var(--tone-success-border)',
    accent: 'var(--color-success)',
    text: 'var(--tone-success-text)',
    title: 'var(--color-success)',
    icon: CheckCircle,
  },
};

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-lg p-4 ${className}`}
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.accent}`,
      }}
    >
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 flex-shrink-0" style={{ color: cfg.title }} />
        <div className="flex-1">
          {title && <h4 className="font-semibold mb-1" style={{ color: cfg.title }}>{title}</h4>}
          <div className="text-sm" style={{ color: cfg.text }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
