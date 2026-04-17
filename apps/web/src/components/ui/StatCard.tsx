import { ReactNode } from 'react';

type StatCardTone = 'default' | 'success' | 'warning' | 'danger';

interface StatCardProps {
  label: string;
  value: string | number;
  helper?: string;
  tone?: StatCardTone;
  icon?: ReactNode;
  onClick?: () => void;
}

const toneClasses: Record<StatCardTone, string> = {
  default: 'border-slate-200 bg-white text-slate-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger:  'border-rose-200 bg-rose-50 text-rose-900',
};

export function StatCard({ label, value, helper, tone = 'default', icon, onClick }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition-all ${toneClasses[tone]} ${
        onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-60">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight leading-none">{value}</p>
          {helper && <p className="mt-2 text-sm opacity-60 leading-snug">{helper}</p>}
        </div>
        {icon && <div className="opacity-60 flex-shrink-0 mt-0.5">{icon}</div>}
      </div>
    </div>
  );
}
