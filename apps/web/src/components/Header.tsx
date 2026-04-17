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
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          title="Toggle sidebar"
        >
          <Menu size={18} className="text-slate-500" />
        </button>

        <div className="min-w-0">
          {workspace ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-slate-800 truncate">{workspace.name}</span>
              {workspace.defaultModel && (
                <>
                  <span className="text-slate-300 flex-shrink-0">/</span>
                  <span className="text-xs font-mono text-slate-500 truncate hidden sm:block">
                    {workspace.defaultModel}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-400 font-medium">No workspace</span>
          )}
        </div>
      </div>

      {/* Right: runtime status + refresh */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <RuntimeBadge ok={runtimeOk} size="sm" />

        <button
          onClick={() => void refresh()}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          title="Refresh state"
        >
          <RotateCw size={16} className="text-slate-400" />
        </button>
      </div>
    </div>
  );
}
