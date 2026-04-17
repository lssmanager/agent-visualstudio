import { ReactNode } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  type?: ToastType;
  message: string;
  onClose?: () => void;
  actions?: ReactNode;
}

const typeStyles: Record<ToastType, { bg: string; text: string; icon: any }> = {
  success: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    icon: CheckCircle,
  },
  error: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: AlertCircle,
  },
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: AlertCircle,
  },
};

export function Toast({ type = 'info', message, onClose, actions }: ToastProps) {
  const style = typeStyles[type];
  const Icon = style.icon;

  return (
    <div
      className={`fixed bottom-4 right-4 max-w-md border ${style.bg} rounded-lg p-4 shadow-lg z-50 flex items-start gap-3`}
      role="alert"
    >
      <Icon size={20} className={`mt-0.5 flex-shrink-0 ${style.text}`} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${style.text}`}>{message}</p>
        {actions && <div className="mt-2">{actions}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600"
          title="Close"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
