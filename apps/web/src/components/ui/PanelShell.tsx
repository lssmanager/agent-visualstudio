import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

interface PanelShellProps {
  title: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function PanelShell({ title, icon: Icon, actions, footer, children }: PanelShellProps) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        className="px-5 py-4 flex items-center justify-between gap-4"
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && <Icon size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
          <h3
            className="text-sm font-semibold leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
          >
            {title}
          </h3>
        </div>
        {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
      </div>

      <div className="p-5">{children}</div>

      {footer && (
        <div
          className="px-5 py-3"
          style={{ borderTop: '1px solid var(--border-secondary)' }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
