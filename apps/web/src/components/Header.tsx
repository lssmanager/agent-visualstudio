import { Menu, RotateCw, Sun, Moon } from 'lucide-react';
import { useStudioState } from '../lib/StudioStateContext';
import { RuntimeBadge } from './ui/RuntimeBadge';
import { useTheme } from '../lib/ThemeProvider';

interface HeaderProps {
  onToggleSidebar: () => void;
  showHamburger?: boolean;
}

export function Header({ onToggleSidebar, showHamburger = false }: HeaderProps) {
  const { state, refresh } = useStudioState();
  const { theme, toggleTheme } = useTheme();

  const workspace = state.workspace;
  const runtimeOk = state.runtime?.health?.ok ?? false;

  const iconBtnStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-primary)',
    color: 'var(--text-muted)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    transition: 'background var(--transition), color var(--transition)',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 16 }}>
      {/* Left: breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {showHamburger && (
          <button onClick={onToggleSidebar} style={iconBtnStyle} title="Toggle sidebar">
            <Menu size={18} />
          </button>
        )}

        <div style={{ minWidth: 0 }}>
          {workspace ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {workspace.name}
              </span>
              {workspace.defaultModel && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>/</span>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {workspace.defaultModel}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-muted)' }}>
              No workspace
            </span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <RuntimeBadge ok={runtimeOk} size="sm" />

        <button
          onClick={() => void refresh()}
          style={iconBtnStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; }}
          title="Refresh state"
        >
          <RotateCw size={15} />
        </button>

        <button
          onClick={toggleTheme}
          style={iconBtnStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; }}
          title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
    </div>
  );
}
