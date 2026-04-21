import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';

import { PageHeader } from '../../../components';
import { useStudioState } from '../../../lib/StudioStateContext';
import { useHierarchy } from '../../../lib/HierarchyContext';

const TABS = ['general', 'providers', 'runtimes', 'channels', 'integrations', 'diagnostics', 'security', 'automations'] as const;
type Tab = typeof TABS[number];

function parseTab(value: string | null): Tab {
  if (
    value === 'general' ||
    value === 'providers' ||
    value === 'runtimes' ||
    value === 'channels' ||
    value === 'integrations' ||
    value === 'diagnostics' ||
    value === 'security' ||
    value === 'automations'
  ) {
    return value;
  }
  return 'general';
}

const TAB_LABEL: Record<Tab, string> = {
  general: 'General',
  providers: 'Providers',
  runtimes: 'Runtimes',
  channels: 'Channels',
  integrations: 'Integrations',
  diagnostics: 'Diagnostics',
  security: 'Security / Policies',
  automations: 'Automations',
};

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { state } = useStudioState();
  const { scope } = useHierarchy();
  const workspace = state.workspace;
  const activeTab = parseTab(searchParams.get('tab'));

  const tabContent = useMemo(() => {
    if (activeTab === 'general') {
      return (
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div><span className="font-medium" style={{ color: 'var(--text-muted)' }}>Workspace</span><p style={{ color: 'var(--text-primary)' }}>{workspace?.name ?? 'No workspace selected'}</p></div>
          <div><span className="font-medium" style={{ color: 'var(--text-muted)' }}>Model</span><p style={{ color: 'var(--text-primary)' }}>{workspace?.defaultModel ?? '—'}</p></div>
          <div><span className="font-medium" style={{ color: 'var(--text-muted)' }}>Agents</span><p style={{ color: 'var(--text-primary)' }}>{state.agents.length}</p></div>
          <div><span className="font-medium" style={{ color: 'var(--text-muted)' }}>Flows</span><p style={{ color: 'var(--text-primary)' }}>{state.flows.length}</p></div>
        </div>
      );
    }

    if (activeTab === 'diagnostics') {
      return (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Runtime diagnostics are now grouped inside Settings.</p>
          {state.compile.diagnostics.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-success)' }}>No compile diagnostics.</div>
          ) : (
            <ul className="list-disc pl-5 text-xs" style={{ color: 'var(--text-primary)' }}>
              {state.compile.diagnostics.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {TAB_LABEL[activeTab]} configuration surface is available and aligned to the new operational IA.
      </div>
    );
  }, [activeTab, state.agents.length, state.compile.diagnostics, state.flows.length, workspace?.defaultModel, workspace?.name]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Settings" icon={SettingsIcon} description="Global configuration and diagnostics" />

      {!scope.agencyId && (
        <div className="rounded-xl border p-4 text-sm" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
          No agency selected. Create or connect an agency to configure studio settings.
        </div>
      )}

      <div className="flex gap-1 border-b flex-wrap" style={{ borderColor: 'var(--border-primary)' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setSearchParams({ tab }, { replace: true })}
            className="px-4 py-2 text-sm font-medium transition-colors relative"
            style={{ color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)' }}
          >
            {TAB_LABEL[tab]}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--color-primary)' }} />
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border p-6" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
        {tabContent}
      </div>
    </div>
  );
}
