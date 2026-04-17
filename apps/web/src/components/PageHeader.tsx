import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
}

export function PageHeader({ title, description, icon: Icon, children }: PageHeaderProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        {Icon && <Icon size={32} className="text-blue-600" />}
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      </div>
      {description && <p className="text-slate-600 mt-1">{description}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
