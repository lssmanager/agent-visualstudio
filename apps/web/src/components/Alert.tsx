import { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';

type AlertVariant = 'info' | 'warning' | 'error' | 'success';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<
  AlertVariant,
  {
    bg: string;
    border: string;
    text: string;
    title: string;
    icon: any;
  }
> = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200 border-l-4 border-l-blue-600',
    text: 'text-blue-800',
    title: 'text-blue-900',
    icon: Info,
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200 border-l-4 border-l-amber-600',
    text: 'text-amber-800',
    title: 'text-amber-900',
    icon: AlertTriangle,
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200 border-l-4 border-l-red-600',
    text: 'text-red-800',
    title: 'text-red-900',
    icon: AlertCircle,
  },
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200 border-l-4 border-l-emerald-600',
    text: 'text-emerald-800',
    title: 'text-emerald-900',
    icon: CheckCircle,
  },
};

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <div className={`${style.bg} ${style.border} rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <Icon size={20} className={`${style.title} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          {title && <h4 className={`font-semibold ${style.title} mb-1`}>{title}</h4>}
          <div className={`text-sm ${style.text}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
