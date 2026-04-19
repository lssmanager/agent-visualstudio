import { Menu, RotateCw } from 'lucide-react';
import { useStudioState } from '../lib/StudioStateContext';
import { RuntimeBadge } from './ui/RuntimeBadge';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { state, refresh } = useStudioState();

  const workspace = state.workspace;
  const runtimeOk = state.runtime?.health?.ok ?? false;

  return (
    <div className="flex items-center justify-between w-full gap-4">
      {/* Left: toggle + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg transition-colors flex-shrink-0"
          style={{
            background: 'transparent',
            ':hover': { background: 'var(--bg-tertiary)' },
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Toggle sidebar"
        >
          <Menu size={18} style={{ color: 'var(--text-muted)' }} />
        </button>

        <div className="min-w-0">
          {workspace ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {workspace.name}
              </span>
              {workspace.defaultModel && (
                <>
                  <span className="flex-shrink-0" style={{ color: 'var(--border-primary)' }}>/</span>
                  <span className="text-xs font-mono truncate hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                    {workspace.defaultModel}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No workspace</span>
          )}
        </div>
      </div>

      {/* Right: runtime status + refresh */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <RuntimeBadge ok={runtimeOk} size="sm" />

        <button
          onClick={() => void refresh()}
          className="p-2 rounded-lg transition-colors"
          style={{
            background: 'transparent',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Refresh state"
        >
          <RotateCw size={16} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>
    </div>
  );
}
