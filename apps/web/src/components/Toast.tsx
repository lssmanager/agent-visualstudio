import { ReactNode } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  type?: ToastType;
  message: string;
  onClose?: () => void;
  actions?: ReactNode;
}

const typeConfig: Record<ToastType, { bg: string; border: string; text: string; icon: typeof CheckCircle }> = {
  success: {
    bg: 'var(--tone-success-bg)',
    border: 'var(--tone-success-border)',
    text: 'var(--tone-success-text)',
    icon: CheckCircle,
  },
  error: {
    bg: 'var(--tone-danger-bg)',
    border: 'var(--tone-danger-border)',
    text: 'var(--tone-danger-text)',
    icon: AlertCircle,
  },
  info: {
    bg: 'var(--color-primary-soft)',
    border: 'var(--color-primary)',
    text: 'var(--color-primary)',
    icon: AlertCircle,
  },
};

export function Toast({ type = 'info', message, onClose, actions }: ToastProps) {
  const cfg = typeConfig[type];
  const Icon = cfg.icon;

  return (
    <div
      className="fixed bottom-4 right-4 max-w-md rounded-lg p-4 z-50 flex items-start gap-3"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: 'var(--shadow-lg)',
      }}
      role="alert"
    >
      <Icon size={20} className="mt-0.5 flex-shrink-0" style={{ color: cfg.text }} />
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: cfg.text }}>{message}</p>
        {actions && <div className="mt-2">{actions}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          title="Close"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
