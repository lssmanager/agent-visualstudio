import { useState } from 'react';
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
  Search,
  Plus,
  Circle,
} from 'lucide-react';
import { useStudioState } from '../lib/StudioStateContext';
import { StudioStateResponse } from '../lib/types';

/* ── Nav items for Column A ─────────────────────────────────── */
const NAV = [
  { label: 'Overview',    path: '/',            Icon: LayoutDashboard },
  { label: 'Studio',      path: '/studio',      Icon: Cpu },
  { label: 'Workspaces',  path: '/workspaces',  Icon: Package },
  { label: 'Agents',      path: '/agents',      Icon: Users },
  { label: 'Profiles',    path: '/profiles',    Icon: BookOpen },
  { label: 'Diagnostics', path: '/diagnostics', Icon: AlertCircle },
  { label: 'Sessions',    path: '/sessions',    Icon: MessageSquare },
  { label: 'Routing',     path: '/routing',     Icon: Landmark },
] as const;

/* ── Contextual panel ───────────────────────────────────────── */
type SidebarItem = { id: string; name: string; sub?: string; dot?: 'green' | 'amber' | 'slate' | 'blue' };

interface SectionCtx {
  label:     string;
  newPath?:  string;
  items:     SidebarItem[];
  emptyText: string;
}

function dotOf(enabled?: boolean): 'green' | 'slate' {
  return enabled === false ? 'slate' : 'green';
}

function getContext(pathname: string, state: StudioStateResponse): SectionCtx {
  const agents   = state.agents   ?? [];
  const profiles = state.profiles ?? [];
  const flows    = state.flows    ?? [];
  const sessions = (state.runtime?.sessions?.payload ?? []) as {
    id?: string; channel?: string; status?: string;
  }[];

  if (pathname.startsWith('/agents') || pathname.startsWith('/studio')) {
    return {
      label:     pathname.startsWith('/studio') ? 'Studio' : 'Agents',
      newPath:   '/agents',
      items:     agents.map((a) => ({
        id:   a.id,
        name: a.name,
        sub:  a.role ?? a.executionMode ?? undefined,
        dot:  dotOf(a.isEnabled),
      })),
      emptyText: 'No agents yet',
    };
  }
  if (pathname.startsWith('/profiles')) {
    return {
      label: 'Profiles',
      items: profiles.map((p) => ({
        id:   p.id,
        name: p.name,
        sub:  p.category,
        dot:  'blue' as const,
      })),
      emptyText: 'No profiles available',
    };
  }
  if (pathname.startsWith('/routing')) {
    return {
      label: 'Routing',
      items: flows.map((f) => ({
        id:   f.id,
        name: f.name,
        sub:  f.trigger,
        dot:  dotOf(f.isEnabled),
      })),
      emptyText: 'No flows configured',
    };
  }
  if (pathname.startsWith('/sessions')) {
    return {
      label: 'Sessions',
      items: sessions.slice(0, 20).map((s, i) => ({
        id:   s.id ?? `session-${i}`,
        name: s.id ? s.id.substring(0, 14) + '…' : `Session ${i + 1}`,
        sub:  s.channel ?? undefined,
        dot:  s.status === 'active' ? 'green' as const : 'slate' as const,
      })),
      emptyText: 'No active sessions',
    };
  }
  if (pathname.startsWith('/workspaces')) {
    const ws = state.workspace;
    return {
      label: 'Workspaces',
      items: ws
        ? [{ id: ws.id, name: ws.name, sub: ws.defaultModel ?? undefined, dot: 'green' as const }]
        : [],
      emptyText: 'No workspace loaded',
    };
  }
  return {
    label:     pathname === '/'
      ? 'Overview'
      : pathname.slice(1).replace(/^\w/, (c) => c.toUpperCase()),
    items:     [],
    emptyText: 'Select a section to browse items',
  };
}

const DOT: Record<NonNullable<SidebarItem['dot']>, string> = {
  green: 'fill-emerald-500 text-emerald-500',
  amber: 'fill-amber-400 text-amber-400',
  slate: 'fill-slate-400 text-slate-400',
  blue:  'fill-blue-500 text-blue-500',
};

/* ── Sidebar ─────────────────────────────────────────────────── */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { state } = useStudioState();
  const [search, setSearch] = useState('');

  const workspace = state.workspace;
  const runtimeOk = state.runtime?.health?.ok ?? false;
  const ctx       = getContext(location.pathname, state);

  const filtered = search.trim()
    ? ctx.items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : ctx.items;

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  return (
    <div className="flex h-full">

      {/* ── Column A — icon rail ──────────────────────── */}
      <div className="w-16 flex-shrink-0 flex flex-col h-full" style={{ background: '#1a1a2e' }}>

        {/* Logo */}
        <button
          onClick={() => go('/')}
          className="w-full h-16 flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-colors"
          title="OpenClaw Studio"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'var(--color-primary)' }}>
            <span className="text-base leading-none">🦞</span>
          </div>
        </button>

        {/* Nav icons */}
        <nav className="flex-1 flex flex-col items-center gap-0.5 py-2 overflow-y-auto">
          {NAV.map(({ label, path, Icon }) => {
            const isActive =
              path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => go(path)}
                title={label}
                className={`relative w-11 h-11 flex items-center justify-center rounded-lg transition-all ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-200'
                }`}
                style={isActive ? { background: 'var(--color-primary)' } : undefined}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = '';
                }}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
                )}
                <Icon size={18} />
              </button>
            );
          })}
        </nav>

        {/* Runtime dot + settings */}
        <div className="flex flex-col items-center gap-1 py-3 flex-shrink-0">
          <div
            title={runtimeOk ? 'Runtime online' : 'Runtime offline'}
            className="w-2 h-2 rounded-full"
            style={{ background: runtimeOk ? 'var(--color-success)' : 'var(--text-muted)' }}
          />
          <button
            className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            style={{ background: 'transparent' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            title="Settings"
          >
            <Settings size={17} />
          </button>
        </div>
      </div>

      {/* ── Column B — contextual panel ──────────────── */}
      <div
        className="flex flex-col overflow-hidden h-full border-r"
        style={{ width: 220, background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
      >
        {/* Section header */}
        <div
          className="px-4 py-3 flex items-center gap-2 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <h3 className="text-xs font-heading font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
            {ctx.label}
          </h3>
          {ctx.newPath && (
            <button
              onClick={() => go(ctx.newPath!)}
              title={`New ${ctx.label}`}
              className="w-5 h-5 flex items-center justify-center rounded text-white transition-colors flex-shrink-0"
              style={{ background: 'var(--color-primary)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary)'; }}
            >
              <Plus size={12} />
            </button>
          )}
        </div>

        {/* Workspace chip */}
        {workspace && (
          <div className="px-3 pt-3 flex-shrink-0">
            <div
              className="rounded-lg px-3 py-2 shadow-sm border"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                {workspace.name}
              </p>
              {workspace.defaultModel && (
                <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {workspace.defaultModel}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        {ctx.items.length > 0 && (
          <div className="px-3 pt-3 flex-shrink-0">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder={`Search…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none transition"
                style={{
                  background:        'var(--input-bg)',
                  borderColor:       'var(--input-border)',
                  color:             'var(--input-text)',
                }}
              />
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => go(ctx.newPath ?? '/')}
                className="w-full flex items-start gap-2 px-2 py-2 rounded-lg text-left transition-all group"
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--card-bg)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Circle
                  size={7}
                  className={`mt-1.5 flex-shrink-0 ${DOT[item.dot ?? 'slate']}`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item.name}
                  </p>
                  {item.sub && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {item.sub}
                    </p>
                  )}
                </div>
              </button>
            ))
          ) : search.trim() ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
              No matches
            </p>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                {ctx.emptyText}
              </p>
              {ctx.newPath && (
                <button
                  onClick={() => go(ctx.newPath!)}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--color-primary)' }}
                >
                  + Create one
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
