const DEFAULT_TABS = [
  { id: 'builder', label: 'Builder' },
  { id: 'test', label: 'Test' },
  { id: 'debug', label: 'Debug' },
  { id: 'topology', label: 'Topology' },
  { id: 'diff', label: 'Diff / Apply' },
] as const;

export type StudioTab = (typeof DEFAULT_TABS)[number]['id'];

interface StudioTabBarProps {
  active: StudioTab;
  onChange: (tab: StudioTab) => void;
  tabs?: ReadonlyArray<{ id: StudioTab; label: string }>;
}

export function StudioTabBar({ active, onChange, tabs = DEFAULT_TABS }: StudioTabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 14px',
        borderBottom: '1px solid var(--shell-panel-border)',
        background: 'var(--shell-panel-bg)',
        flexWrap: 'wrap',
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: isActive ? 'var(--color-primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--color-primary-soft)' : 'var(--shell-chip-bg)',
              border: `1px solid ${isActive ? 'color-mix(in srgb, var(--color-primary) 32%, var(--shell-chip-border))' : 'var(--shell-chip-border)'}`,
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              transition: 'color var(--transition), background var(--transition), border-color var(--transition)',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
