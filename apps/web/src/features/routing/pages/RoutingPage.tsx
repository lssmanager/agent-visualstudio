import { Landmark, GitBranch } from 'lucide-react';

import { useStudioState } from '../../../lib/StudioStateContext';
import { ChannelBindingsTable } from '../components/ChannelBindingsTable';
import { RouteEditor } from '../components/RouteEditor';
import { PageHeader, Alert, Card, Badge, EmptyState } from '../../../components';

export default function RoutingPage() {
  const { state, refresh } = useStudioState();
  const flows = state.flows ?? [];

  if (!state.workspace) {
    return (
      <div className="max-w-6xl mx-auto">
        <Alert variant="warning" title="No Workspace">
          Create or select a workspace first to configure routing rules.
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Routing & Channels"
        description="Configure how agents are routed to channels and manage channel bindings."
        icon={Landmark}
      />

      {/* Flows */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <GitBranch size={18} className="text-blue-600" />
          Flows
        </h2>
        {flows.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="No Flows"
            description="No flows configured in this workspace."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {flows.map((flow: any) => (
              <Card key={flow.id} className="p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <span className="text-sm font-semibold text-slate-900">{flow.name}</span>
                  <Badge variant={flow.isEnabled ? 'success' : 'default'}>
                    {flow.isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                {flow.description && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{flow.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                  {flow.trigger && (
                    <Badge variant="default">{flow.trigger}</Badge>
                  )}
                  <span>{flow.nodes?.length ?? 0} nodes</span>
                  <span>{flow.edges?.length ?? 0} edges</span>
                </div>
                {flow.tags?.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {flow.tags.map((tag: string) => (
                      <Badge key={tag} variant="info">{tag}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 2-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Channel Bindings */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Channel Bindings</h3>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <ChannelBindingsTable agents={state.agents} />
            </div>
            <p className="text-xs text-slate-500 mt-4">
              Shows which agents are bound to which channels for message delivery.
            </p>
          </Card>
        </div>

        {/* Right Panel: Route Editor */}
        <div className="lg:col-span-2">
          <Card>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Route Configuration</h3>
            <div className="prose prose-sm max-w-none prose-table:w-full">
              <RouteEditor workspace={state.workspace} onSaved={(_ws) => { void refresh(); }} />
            </div>
          </Card>
        </div>
      </div>

      {/* Info Section */}
      <Alert variant="info" title="How Routing Works">
        <ul className="space-y-1 list-disc list-inside">
          <li>
            <strong>Channel Bindings:</strong> Map agents to communication channels (email, Slack, Teams, etc.)
          </li>
          <li>
            <strong>Rules:</strong> Define conditions for routing messages to specific agents
          </li>
          <li>
            <strong>Fallback:</strong> If no rules match, messages go to the default agent
          </li>
          <li>
            <strong>Load Balancing:</strong> Distribute incoming messages across multiple agents
          </li>
        </ul>
      </Alert>
    </div>
  );
}
