import type { AgencyBuilderTab, SurfaceId } from './types';

export const NODE_QUERY_KEY = 'node';
export const TAB_QUERY_KEY = 'tab';

export const SURFACE_LABELS: Record<SurfaceId, string> = {
  'agency-builder': 'Administration',
  'workspace-studio': 'Studio',
  'entity-editor': 'Agents Builder',
  profiles: 'Profiles Hub',
  runs: 'Runs',
  sessions: 'Sessions',
  settings: 'Settings',
};

export function surfaceFromPath(pathname: string): SurfaceId {
  if (pathname.startsWith('/workspace-studio')) return 'workspace-studio';
  if (pathname.startsWith('/agency-builder')) return 'agency-builder';
  if (pathname.startsWith('/administration')) return 'agency-builder';
  if (pathname.startsWith('/agents-builder')) return 'entity-editor';
  if (pathname.startsWith('/entity-editor')) return 'entity-editor';
  if (pathname.startsWith('/profiles')) return 'profiles';
  if (pathname.startsWith('/runs')) return 'runs';
  if (pathname.startsWith('/sessions')) return 'sessions';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'agency-builder';
}

export function isAdministrationPath(pathname: string): boolean {
  return pathname.startsWith('/administration') || pathname.startsWith('/agency-builder');
}

export function isStudioPath(pathname: string): boolean {
  return (
    pathname.startsWith('/workspace-studio') ||
    pathname.startsWith('/agents-builder') ||
    pathname.startsWith('/entity-editor')
  );
}

export function isProductSurfacePath(pathname: string, surface: SurfaceId): boolean {
  if (surface === 'agency-builder') return isAdministrationPath(pathname);
  if (surface === 'workspace-studio') return pathname.startsWith('/workspace-studio');
  if (surface === 'entity-editor') {
    return pathname.startsWith('/agents-builder') || pathname.startsWith('/entity-editor');
  }
  if (surface === 'profiles') return pathname.startsWith('/profiles');
  if (surface === 'runs') return pathname.startsWith('/runs');
  if (surface === 'sessions') return pathname.startsWith('/sessions');
  return pathname.startsWith('/settings');
}

export function getSurfaceLabel(surface: SurfaceId): string {
  return SURFACE_LABELS[surface];
}

export function pathForSurface(surface: SurfaceId): string {
  if (surface === 'workspace-studio') return '/workspace-studio';
  if (surface === 'entity-editor') return '/agents-builder';
  if (surface === 'profiles') return '/profiles';
  if (surface === 'runs') return '/runs';
  if (surface === 'sessions') return '/sessions';
  if (surface === 'settings') return '/settings';
  return '/administration';
}

export function buildStudioHref(options: {
  surface: SurfaceId;
  nodeKey?: string | null;
  tab?: AgencyBuilderTab;
}): string {
  const path = pathForSurface(options.surface);
  const params = new URLSearchParams();

  if (options.surface === 'agency-builder' && options.tab) {
    params.set(TAB_QUERY_KEY, options.tab);
  }

  if (options.nodeKey) {
    params.set(NODE_QUERY_KEY, options.nodeKey);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function parseNodeQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get(NODE_QUERY_KEY);
}

export function parseBuilderTab(search: string): AgencyBuilderTab | null {
  const params = new URLSearchParams(search);
  const value = params.get(TAB_QUERY_KEY);
  if (
    value === 'overview' ||
    value === 'connections' ||
    value === 'sessions' ||
    value === 'profile' ||
    value === 'settings' ||
    value === 'topology' ||
    value === 'structure' ||
    value === 'routing' ||
    value === 'hooks' ||
    value === 'versions' ||
    value === 'operations'
  ) {
    return value;
  }
  return null;
}

