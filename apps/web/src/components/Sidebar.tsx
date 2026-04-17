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
  ChevronRight,
} from 'lucide-react';
import { useStudioState } from '../lib/StudioStateContext';
import { RuntimeBadge } from './ui/RuntimeBadge';

const navItems = [
  { label: 'Overview',    path: '/',            Icon: LayoutDashboard },
  { label: 'Studio',      path: '/studio',      Icon: Cpu },
  { label: 'Workspaces',  path: '/workspaces',  Icon: Package },
  { label: 'Agents',      path: '/agents',      Icon: Users },
  { label: 'Profiles',    path: '/profiles',    Icon: BookOpen },
  { label: 'Diagnostics', path: '/diagnostics', Icon: AlertCircle },
  { label: 'Sessions',    path: '/sessions',    Icon: MessageSquare },
  { label: 'Routing',     path: '/routing',     Icon: Landmark },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { state } = useStudioState();

  const workspace = state.workspace;
  const runtimeOk = state.runtime?.health?.ok ?? false;

  return (
    <div className="flex flex-col h-full select-none">
      {/* Logo / Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/40">
            <span className="text-lg leading-none">🦞</span>
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">OpenClaw Studio</p>
            <p className="text-[11px] text-slate-500 leading-tight mt-0.5">v1.0</p>
          </div>
        </div>
      </div>

      {/* Workspace chip */}
      {workspace && (
        <div className="px-4 pt-4 pb-3 border-b border-slate-800/40">
          <div className="rounded-lg bg-slate-800/60 px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-200 truncate leading-tight">{workspace.name}</p>
            {workspace.defaultModel && (
              <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{workspace.defaultModel}</p>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ label, path, Icon }) => {
          const isActive =
            path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);

          return (
            <button
              key={path}
              onClick={() => { navigate(path); onNavigate?.(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon size={17} className="flex-shrink-0" />
              <span className="text-sm font-medium flex-1 truncate">{label}</span>
              {isActive && <ChevronRight size={14} className="flex-shrink-0 opacity-50" />}
            </button>
          );
        })}
      </nav>

      {/* Footer: runtime health */}
      <div className="px-4 py-4 border-t border-slate-800/60">
        <div className="rounded-lg bg-slate-800/40 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Runtime</p>
          <RuntimeBadge ok={runtimeOk} size="sm" />
        </div>
      </div>
    </div>
  );
}
