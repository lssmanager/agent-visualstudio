import { useState } from 'react';
import { Landmark } from 'lucide-react';

import { useStudioState } from '../../../lib/StudioStateContext';
import { WorkspaceSpec } from '../../../lib/types';
import { ChannelBindingsTable } from '../components/ChannelBindingsTable';
import { RouteEditor } from '../components/RouteEditor';
import { PageHeader, Alert, Card } from '../../../components';

export default function RoutingPage() {
  const { state } = useStudioState();
  const [workspace, setWorkspace] = useState<WorkspaceSpec | null>(state.workspace);

  if (!workspace) {
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
              <RouteEditor workspace={workspace} onSaved={setWorkspace} />
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
