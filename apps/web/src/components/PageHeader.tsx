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
        {Icon && <Icon size={32} style={{ color: 'var(--color-primary)' }} />}
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      </div>
      {description && <p className="mt-1" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
