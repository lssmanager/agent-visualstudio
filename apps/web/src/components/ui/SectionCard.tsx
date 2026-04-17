import { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: SectionCardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm ${className}`}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <div className="flex-shrink-0 text-blue-600">{icon}</div>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 leading-tight">{title}</h3>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
