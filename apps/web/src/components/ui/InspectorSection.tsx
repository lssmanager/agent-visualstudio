import { useState } from 'react';
import { type ReactNode } from 'react';
import { type LucideIcon, ChevronDown } from 'lucide-react';

interface InspectorSectionProps {
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function InspectorSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: InspectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: '1px solid var(--card-border)',
        background: 'var(--card-bg)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 w-full px-4 py-3 text-left"
        style={{
          background: 'var(--bg-secondary)',
          border: 'none',
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--card-border)' : '1px solid transparent',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
          <span
            className="text-sm font-semibold leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
          >
            {title}
          </span>
        </div>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--text-muted)',
            flexShrink: 0,
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 200ms ease',
          }}
        />
      </button>

      <div
        style={{
          maxHeight: open ? '2000px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 300ms ease',
        }}
      >
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
