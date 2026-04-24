import type { AgencyBuilderTab, CanonicalNodeLevel } from './types';

export interface ScopeSettingsMode {
  value: 'global/defaults' | 'partial' | 'scoped';
}

export interface ScopeViewDefinition {
  adminTabs: AgencyBuilderTab[];
  canEnterStudio: boolean;
  showProfileTab: boolean;
  settingsScope: ScopeSettingsMode['value'];
  operations: boolean;
  sessionsMode: 'aggregated' | 'scoped';
  runsMode: 'aggregated' | 'scoped';
}

export const SCOPE_VIEW_REGISTRY: Record<CanonicalNodeLevel, ScopeViewDefinition> = {
  agency: {
    adminTabs: ['overview', 'connections', 'operations', 'runs', 'sessions', 'profile', 'settings'],
    canEnterStudio: false,
    showProfileTab: true,
    settingsScope: 'global/defaults',
    operations: true,
    sessionsMode: 'aggregated',
    runsMode: 'aggregated',
  },
  department: {
    adminTabs: ['overview', 'connections', 'operations', 'runs', 'sessions', 'profile', 'settings'],
    canEnterStudio: false,
    showProfileTab: true,
    settingsScope: 'partial',
    operations: true,
    sessionsMode: 'aggregated',
    runsMode: 'aggregated',
  },
  workspace: {
    adminTabs: ['overview', 'connections', 'operations', 'runs', 'sessions', 'profile', 'settings'],
    canEnterStudio: true,
    showProfileTab: true,
    settingsScope: 'scoped',
    operations: true,
    sessionsMode: 'scoped',
    runsMode: 'scoped',
  },
  agent: {
    adminTabs: ['overview', 'connections', 'operations', 'runs', 'sessions', 'profile', 'settings'],
    canEnterStudio: true,
    showProfileTab: true,
    settingsScope: 'scoped',
    operations: true,
    sessionsMode: 'scoped',
    runsMode: 'scoped',
  },
  subagent: {
    adminTabs: ['overview', 'connections', 'operations', 'runs', 'sessions', 'profile', 'settings'],
    canEnterStudio: true,
    showProfileTab: true,
    settingsScope: 'scoped',
    operations: true,
    sessionsMode: 'scoped',
    runsMode: 'scoped',
  },
};
