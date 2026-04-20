import { Menu, Moon, Plus, RotateCw, Sun } from 'lucide-react';

import { useOnboarding } from '../lib/OnboardingContext';
import { useStudioState } from '../lib/StudioStateContext';
import { useTheme } from '../lib/ThemeProvider';
import { RuntimeBadge } from './ui/RuntimeBadge';

interface HeaderProps {
  onToggleSidebar: () => void;
  showHamburger?: boolean;
}

export function Header({ onToggleSidebar, showHamburger = false }: HeaderProps) {
  const { state, refresh } = useStudioState();
  const { theme, toggleTheme } = useTheme();
  const { openOnboarding } = useOnboarding();

  const workspace = state.workspace;
  const runtimeOk = state.runtime?.health?.ok ?? false;

  const iconButton: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: '1px solid var(--shell-chip-border)',
    background: 'var(--shell-chip-bg)',
    color: 'var(--text-muted)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    transition: 'background var(--transition), color var(--transition), border-color var(--transition)',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {showHamburger && (
          <button onClick={onToggleSidebar} style={iconButton} title="Toggle sidebar">
            <Menu size={18} />
          </button>
        )}

        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          {workspace ? (
            <>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Workspace
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {workspace.name}
                </span>
                {workspace.defaultModel && (
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {workspace.defaultModel}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>No workspace selected</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {!workspace && (
          <button
            onClick={openOnboarding}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 13px',
              borderRadius: 12,
              border: '1px solid rgba(77,124,255,0.4)',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Plus size={14} />
            New Workspace
          </button>
        )}

        <RuntimeBadge ok={runtimeOk} size="sm" />

        <button
          onClick={() => void refresh()}
          style={iconButton}
          onMouseEnter={(event) => {
            const current = event.currentTarget as HTMLElement;
            current.style.background = 'var(--card-hover)';
            current.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(event) => {
            const current = event.currentTarget as HTMLElement;
            current.style.background = 'var(--shell-chip-bg)';
            current.style.color = 'var(--text-muted)';
          }}
          title="Refresh state"
        >
          <RotateCw size={15} />
        </button>

        <button
          onClick={toggleTheme}
          style={iconButton}
          onMouseEnter={(event) => {
            const current = event.currentTarget as HTMLElement;
            current.style.background = 'var(--card-hover)';
            current.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(event) => {
            const current = event.currentTarget as HTMLElement;
            current.style.background = 'var(--shell-chip-bg)';
            current.style.color = 'var(--text-muted)';
          }}
          title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
    </div>
  );
}
