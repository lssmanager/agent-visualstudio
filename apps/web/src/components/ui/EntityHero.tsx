import { type ReactNode } from 'react';

interface EntityHeroProps {
  name: string;
  type?: string;
  status?: ReactNode;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function EntityHero({ name, type, status, description, actions, meta }: EntityHeroProps) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: 'var(--card-border)',
        background: 'var(--card-bg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="p-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            {type && (
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: 'var(--color-primary-soft)',
                  color: 'var(--color-primary)',
                }}
              >
                {type}
              </span>
            )}
            {status && <span>{status}</span>}
          </div>

          <h1
            className="text-xl font-bold leading-tight mb-1"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-heading)',
              margin: 0,
            }}
          >
            {name}
          </h1>

          {description && (
            <p
              className="text-sm mt-1.5"
              style={{
                color: 'var(--text-muted)',
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {meta && (
        <div
          className="px-5 py-3 border-t flex items-center gap-4 flex-wrap"
          style={{
            borderColor: 'var(--border-primary)',
            background: 'var(--bg-secondary)',
          }}
        >
          {meta}
        </div>
      )}
    </div>
  );
}
