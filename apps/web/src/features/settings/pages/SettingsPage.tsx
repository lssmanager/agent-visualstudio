import { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

import { PageHeader } from '../../../components';
import { useStudioState } from '../../../lib/StudioStateContext';
import { BudgetPanel } from '../components/BudgetPanel';
import { AuditLogPanel } from '../components/AuditLogPanel';
import { McpRegistryPanel } from '../components/McpRegistryPanel';

const TABS = ['General', 'Budgets', 'Audit', 'MCP'] as const;
type Tab = typeof TABS[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('General');
  const { state } = useStudioState();
  const workspace = state.workspace;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Settings" icon={SettingsIcon} description="Workspace configuration and governance" />

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)',
            }}
          >
            {tab}
            {activeTab === tab && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: 'var(--color-primary)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        className="rounded-xl border p-6"
        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
      >
        {activeTab === 'General' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Workspace</h3>
            {workspace ? (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Name</span>
                  <p style={{ color: 'var(--text-primary)' }}>{workspace.name}</p>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Slug</span>
                  <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{workspace.slug}</p>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Default Model</span>
                  <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{workspace.defaultModel ?? '—'}</p>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>ID</span>
                  <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{workspace.id}</p>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Agents</span>
                  <p style={{ color: 'var(--text-primary)' }}>{state.agents.length}</p>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Flows</span>
                  <p style={{ color: 'var(--text-primary)' }}>{state.flows.length}</p>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Skills</span>
                  <p style={{ color: 'var(--text-primary)' }}>{state.skills.length}</p>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Runtime</span>
                  <p style={{ color: state.runtime?.health?.ok ? '#059669' : '#dc2626' }}>
                    {state.runtime?.health?.ok ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No workspace loaded.</p>
            )}
          </div>
        )}

        {activeTab === 'Budgets' && <BudgetPanel />}
        {activeTab === 'Audit' && <AuditLogPanel />}
        {activeTab === 'MCP' && <McpRegistryPanel />}
      </div>
    </div>
  );
}
