import { useStudioState } from '../lib/StudioStateContext';
import { Menu, RotateCw, Circle } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function Header({ onToggleSidebar, sidebarOpen }: HeaderProps) {
  const { state, refresh } = useStudioState();

  const runtimeOk = state.runtime?.ok ?? false;
  const hasWorkspace = state.workspace !== null;

  return (
    <div className="flex items-center justify-between w-full">
      {/* Left: Menu toggle + branding */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors md:hidden"
          title="Toggle sidebar"
        >
          <Menu size={20} className="text-slate-600" />
        </button>
        <h2 className="text-sm font-semibold text-slate-900 hidden md:block">
          {hasWorkspace ? `Workspace: ${state.workspace?.name}` : 'No Workspace'}
        </h2>
      </div>

      {/* Right: Status + Actions */}
      <div className="flex items-center gap-4">
        {/* Runtime Health */}
        <div className="flex items-center gap-2">
          <Circle
            size={10}
            className={runtimeOk ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'}
          />
          <span className="text-xs text-slate-600">
            {runtimeOk ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Refresh button */}
        <button
          onClick={() => refresh()}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          title="Refresh state"
        >
          <RotateCw size={18} className="text-slate-600" />
        </button>

        {/* Workspace indicator if exists */}
        {hasWorkspace && (
          <div className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
            Active
          </div>
        )}
      </div>
    </div>
  );
}
