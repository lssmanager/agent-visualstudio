import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  Package,
  Users,
  BookOpen,
  AlertCircle,
  MessageSquare,
  Landmark,
  Settings,
  Play,
  Webhook,
  GitBranch,
  Terminal,
  BarChart3,
} from 'lucide-react';
import { useStudioState } from '../lib/StudioStateContext';

const NAV = [
  { label: 'Overview',    path: '/',            Icon: LayoutDashboard },
  { label: 'Studio',      path: '/studio',      Icon: Cpu },
  { label: 'Workspaces',  path: '/workspaces',  Icon: Package },
  { label: 'Agents',      path: '/agents',      Icon: Users },
  { label: 'Profiles',    path: '/profiles',    Icon: BookOpen },
  { label: 'Runs',        path: '/runs',        Icon: Play },
  { label: 'Routing',     path: '/routing',     Icon: Landmark },
  { label: 'Hooks',       path: '/hooks',       Icon: Webhook },
  { label: 'Versions',    path: '/versions',    Icon: GitBranch },
  { label: 'Commands',    path: '/commands',     Icon: Terminal },
  { label: 'Operations',  path: '/operations',  Icon: BarChart3 },
  { label: 'Diagnostics', path: '/diagnostics', Icon: AlertCircle },
  { label: 'Sessions',    path: '/sessions',    Icon: MessageSquare },
] as const;

export function NavRail({ onNavigate }: { onNavigate?: () => void }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { state } = useStudioState();
  const runtimeOk = state.runtime?.health?.ok ?? false;

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  return (
    <div
      style={{
        width: 64,
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '14px 8px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Brand logo */}
      <button
        onClick={() => go('/')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-primary)',
          color: '#FFFFFF',
          border: 'none',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: 10,
          flexShrink: 0,
        }}
        title="OpenClaw Studio"
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>🦞</span>
      </button>

      {/* Nav items */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' }}>
        {NAV.map(({ label, path, Icon }) => {
          const isActive =
            path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);

          return (
            <button
              key={path}
              onClick={() => go(path)}
              data-tip={label}
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-md)',
                border: isActive ? '1px solid rgba(34,89,242,0.25)' : '1px solid transparent',
                background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--text-muted)',
                boxShadow: isActive ? 'inset 2px 0 0 var(--color-primary)' : 'none',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                transition: 'background var(--transition), color var(--transition)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                }
              }}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </nav>

      {/* Bottom: runtime dot + settings */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 8, flexShrink: 0 }}>
        <div
          title={runtimeOk ? 'Runtime online' : 'Runtime offline'}
          style={{
            width: 8,
            height: 8,
            borderRadius: 'var(--radius-full)',
            background: runtimeOk ? 'var(--color-success)' : 'var(--text-muted)',
          }}
        />
        <button
          onClick={() => go('/settings')}
          data-tip="Settings"
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-md)',
            border: '1px solid transparent',
            background: 'transparent',
            color: 'var(--text-muted)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            transition: 'background var(--transition), color var(--transition)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
          }}
        >
          <Settings size={17} />
        </button>
      </div>
    </div>
  );
}
