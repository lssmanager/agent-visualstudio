import { type LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  variant?: 'pills' | 'underline';
}

export function SegmentedTabs({ tabs, active, onChange, variant = 'pills' }: SegmentedTabsProps) {
  if (variant === 'underline') {
    return (
      <div
        className="flex gap-1"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors"
              style={{
                color: isActive ? 'var(--color-primary)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: '-1px',
                cursor: 'pointer',
                fontFamily: 'var(--font-heading)',
              }}
            >
              {TabIcon && <TabIcon size={16} />}
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg p-1"
      style={{ background: 'var(--bg-tertiary)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const TabIcon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all"
            style={{
              color: isActive ? 'var(--btn-primary-text)' : 'var(--text-muted)',
              background: isActive ? 'var(--color-primary)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-heading)',
            }}
          >
            {TabIcon && <TabIcon size={16} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
