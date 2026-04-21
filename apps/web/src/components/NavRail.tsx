import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Building2,
  Cpu,
  MessageSquare,
  Play,
  Settings,
  SquarePen,
} from 'lucide-react';

import { useStudioState } from '../lib/StudioStateContext';
import { useHierarchy } from '../lib/HierarchyContext';

const NAV = [
  { label: 'Agency Builder', path: '/agency-builder', Icon: Building2 },
  { label: 'Workspace Studio', path: '/workspace-studio', Icon: Cpu },
  { label: 'Entity Editor', path: '/entity-editor', Icon: SquarePen },
  { label: 'Profiles', path: '/profiles', Icon: BookOpen },
  { label: 'Runs', path: '/runs', Icon: Play },
  { label: 'Sessions', path: '/sessions', Icon: MessageSquare },
] as const;

export function NavRail({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useStudioState();
  const { setSurface } = useHierarchy();
  const runtimeOk = state.runtime?.health?.ok ?? false;

  function go(path: string) {
    if (path.startsWith('/agency-builder')) setSurface('agency-builder');
    if (path.startsWith('/workspace-studio')) setSurface('workspace-studio');
    if (path.startsWith('/entity-editor')) setSurface('entity-editor');
    if (path.startsWith('/profiles')) setSurface('profiles');
    if (path.startsWith('/runs')) setSurface('runs');
    if (path.startsWith('/sessions')) setSurface('sessions');
    if (path.startsWith('/settings')) setSurface('settings');
    navigate(path);
    onNavigate?.();
  }

  return (
    <div
      style={{
        width: 64,
        background: 'var(--shell-rail-bg)',
        borderRight: '1px solid var(--shell-rail-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '12px 8px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <button
        onClick={() => go('/agency-builder?tab=overview')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'var(--color-primary)',
          color: '#ffffff',
          border: 'none',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: 8,
          flexShrink: 0,
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '0.04em',
        }}
        title="OpenClaw Studio"
      >
        OC
      </button>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: '100%' }}>
        {NAV.map(({ label, path, Icon }) => {
          const isActive = location.pathname.startsWith(path);
          return (
            <button
              key={path}
              onClick={() => go(path)}
              data-tip={label}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: isActive ? '1px solid rgba(77,124,255,0.34)' : '1px solid transparent',
                background: isActive ? 'rgba(77,124,255,0.2)' : 'transparent',
                color: isActive ? '#f2f7ff' : 'var(--shell-rail-text)',
                opacity: isActive ? 1 : 0.86,
                boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.05)' : 'none',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                transition: 'background var(--transition), border-color var(--transition), opacity var(--transition)',
              }}
              onMouseEnter={(event) => {
                if (!isActive) {
                  const current = event.currentTarget as HTMLElement;
                  current.style.background = 'rgba(255,255,255,0.06)';
                  current.style.opacity = '1';
                }
              }}
              onMouseLeave={(event) => {
                if (!isActive) {
                  const current = event.currentTarget as HTMLElement;
                  current.style.background = 'transparent';
                  current.style.opacity = '0.86';
                }
              }}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 8, flexShrink: 0 }}>
        <div
          title={runtimeOk ? 'Runtime online' : 'Runtime offline'}
          style={{
            width: 8,
            height: 8,
            borderRadius: 'var(--radius-full)',
            background: runtimeOk ? 'var(--color-success)' : 'var(--text-muted)',
            boxShadow: runtimeOk ? '0 0 0 4px rgba(51,196,129,0.14)' : 'none',
          }}
        />
        <button
          onClick={() => go('/settings')}
          data-tip="Settings"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: '1px solid transparent',
            background: 'transparent',
            color: 'var(--shell-rail-text)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            opacity: 0.86,
            transition: 'background var(--transition), opacity var(--transition)',
          }}
          onMouseEnter={(event) => {
            const current = event.currentTarget as HTMLElement;
            current.style.background = 'rgba(255,255,255,0.06)';
            current.style.opacity = '1';
          }}
          onMouseLeave={(event) => {
            const current = event.currentTarget as HTMLElement;
            current.style.background = 'transparent';
            current.style.opacity = '0.86';
          }}
        >
          <Settings size={17} />
        </button>
      </div>
    </div>
  );
}
