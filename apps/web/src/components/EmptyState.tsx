import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {Icon && <Icon size={48} className="text-slate-300 mb-4" />}
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-600 mb-4">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
