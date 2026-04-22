import { StudioStateResponse } from './types';

export type SidebarItem = {
  id: string;
  name: string;
  sub?: string;
  dot?: 'green' | 'amber' | 'slate' | 'blue';
};

export interface SectionCtx {
  label: string;
  newPath?: string;
  items: SidebarItem[];
  emptyText: string;
}

export function dotOf(enabled?: boolean): 'green' | 'slate' {
  return enabled === false ? 'slate' : 'green';
}

export const DOT_COLORS: Record<NonNullable<SidebarItem['dot']>, string> = {
  green: 'var(--color-success)',
  amber: 'var(--color-warning)',
  slate: 'var(--text-muted)',
  blue:  'var(--color-primary)',
};

export function getContext(pathname: string, state: StudioStateResponse): SectionCtx {
  const agents   = state.agents   ?? [];
  const profiles = state.profiles ?? [];
  const flows    = state.flows    ?? [];
  const sessions = (state.runtime?.sessions?.payload ?? []) as {
    id?: string; channel?: string; status?: string;
  }[];

  if (
    pathname.startsWith('/agents') ||
    pathname.startsWith('/studio') ||
    pathname.startsWith('/workspace-studio')
  ) {
    return {
      label:
        pathname.startsWith('/studio') || pathname.startsWith('/workspace-studio')
          ? 'Workspace Studio'
          : 'Agents',
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
  if (pathname.startsWith('/agency-builder')) {
    const ws = state.workspace;
    return {
      label: 'Administration',
      items: ws ? [{
        id: ws.id,
        name: ws.name,
        sub: ws.defaultModel,
        dot: 'blue',
      }] : [],
      emptyText: 'No agency data loaded',
    };
  }
  if (pathname.startsWith('/agency-topology')) {
    const ws = state.workspace;
    return {
      label: 'Connections',
      items: ws ? [{
        id: ws.id,
        name: ws.name,
        sub: 'Fail-closed runtime controls',
        dot: 'amber',
      }] : [],
      emptyText: 'No topology nodes available',
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
