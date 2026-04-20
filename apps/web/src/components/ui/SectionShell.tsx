import { type ReactNode } from 'react';

interface SectionShellProps {
  title: string;
  badge?: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function SectionShell({ title, badge, description, actions, children }: SectionShellProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2
            className="text-base font-semibold leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
          >
            {title}
          </h2>
          {badge && <div className="flex-shrink-0">{badge}</div>}
        </div>
        {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
      </div>

      {description && (
        <p
          className="text-sm mb-4 leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      )}

      {!description && <div className="mb-4" />}

      <div>{children}</div>
    </section>
  );
}
