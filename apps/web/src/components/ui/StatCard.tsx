import { ReactNode, CSSProperties } from 'react';

type StatCardTone = 'default' | 'success' | 'warning' | 'danger';

interface StatCardProps {
  label: string;
  value: string | number;
  helper?: string;
  tone?: StatCardTone;
  icon?: ReactNode;
  onClick?: () => void;
}

const toneStyles: Record<StatCardTone, CSSProperties> = {
  default: {
    background: 'var(--card-bg)',
    borderColor: 'var(--card-border)',
    color: 'var(--text-primary)',
  },
  success: {
    background: 'var(--tone-success-bg)',
    borderColor: 'var(--tone-success-border)',
    color: 'var(--tone-success-text)',
  },
  warning: {
    background: 'var(--tone-warning-bg)',
    borderColor: 'var(--tone-warning-border)',
    color: 'var(--tone-warning-text)',
  },
  danger: {
    background: 'var(--tone-danger-bg)',
    borderColor: 'var(--tone-danger-border)',
    color: 'var(--tone-danger-text)',
  },
};

export function StatCard({ label, value, helper, tone = 'default', icon, onClick }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''
      }`}
      style={toneStyles[tone]}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-60">{label}</p>
          <p className="mt-2 font-bold tracking-tight leading-none" style={{ fontSize: 'var(--text-3xl)' }}>{value}</p>
          {helper && <p className="mt-2 text-sm opacity-60 leading-snug">{helper}</p>}
        </div>
        {icon && <div className="opacity-60 flex-shrink-0 mt-0.5">{icon}</div>}
      </div>
    </div>
  );
}
