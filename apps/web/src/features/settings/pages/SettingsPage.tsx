import { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

import { PageHeader } from '../../../components';
import { useStudioState } from '../../../lib/StudioStateContext';
import { BudgetSettings } from '../components/BudgetSettings';
import { AuditLogPanel } from '../components/AuditLogPanel';
import { McpRegistryPanel } from '../components/McpRegistryPanel';
import { ChannelsSettingsTab } from '../components/ChannelsSettingsTab';
import { LlmProvidersTab } from '../components/LlmProvidersTab';
import { ModelSettings } from '../components/ModelSettings';

// F6-11: añadir 'Model Policy' junto a 'LLM Keys' (misma sección LLM, tab hermano)
// F6-12: BudgetPanel → BudgetSettings
const TABS = ['General', 'Budgets', 'Audit', 'MCP', 'Channels', 'LLM Keys', 'Model Policy'] as const;
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
            style={{ color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)' }}
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
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No workspace selected.</p>
            )}
          </div>
        )}
        {/* F6-12: BudgetPanel → BudgetSettings con props scope-aware */}
        {activeTab === 'Budgets' && (
          workspace
            ? <BudgetSettings workspaceId={workspace.id} agents={state.agents} />
            : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a workspace first.</p>
        )}
        {activeTab === 'Audit'    && <AuditLogPanel />}
        {activeTab === 'MCP'      && <McpRegistryPanel />}
        {activeTab === 'Channels' && workspace && (
          <ChannelsSettingsTab
            workspaceId={workspace.id}
            agents={state.agents}
          />
        )}
        {activeTab === 'LLM Keys' && workspace && (
          <LlmProvidersTab workspaceId={workspace.id} />
        )}
        {/* F6-11: ModelSettings — política de modelo por scope jerárquico.
            Pasa workspace/agency IDs del contexto si están disponibles.
            Funciona sin workspace seleccionado (usa __global__ como scopeId). */}
        {activeTab === 'Model Policy' && (
          <ModelSettings
            workspaceId={workspace?.id}
            agencyId={workspace?.id ? undefined : '__global__'}
          />
        )}
        {(activeTab === 'Channels' || activeTab === 'LLM Keys') && !workspace && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a workspace first.</p>
        )}
      </div>
    </div>
  );
}
