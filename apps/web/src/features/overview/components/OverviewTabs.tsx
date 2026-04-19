export type OverviewTab = 'overview' | 'agents' | 'profiles' | 'flows' | 'runtime';

interface OverviewTabsProps {
  active: OverviewTab;
  onChange: (tab: OverviewTab) => void;
}

const TABS: { id: OverviewTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'agents',   label: 'Agents' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'flows',    label: 'Flows' },
  { id: 'runtime',  label: 'Runtime' },
];

export function OverviewTabs({ active, onChange }: OverviewTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border-primary)',
        paddingBottom: 0,
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--color-primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--color-primary-soft)' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
              cursor: 'pointer',
              transition: 'all var(--transition)',
              marginBottom: -1,
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
