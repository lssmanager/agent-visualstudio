import { type ReactNode } from 'react';

interface ToolbarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function Toolbar({ left, center, right, className = '' }: ToolbarProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-3 ${className}`}
      style={{
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-primary)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">{left}</div>
      {center && <div className="flex items-center gap-2">{center}</div>}
      <div className="flex items-center gap-2 flex-shrink-0">{right}</div>
    </div>
  );
}
