import { useState } from 'react';

import { useStudioState } from '../../../lib/StudioStateContext';
import { WorkspaceSpec } from '../../../lib/types';
import { ChannelBindingsTable } from '../components/ChannelBindingsTable';
import { RouteEditor } from '../components/RouteEditor';

export function RoutingPage() {
  const { state } = useStudioState();
  const [workspace, setWorkspace] = useState<WorkspaceSpec | null>(state.workspace);

  if (!workspace) {
    return <div className="p-4 text-sm">No workspace loaded.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <ChannelBindingsTable agents={state.agents} />
      <RouteEditor workspace={workspace} onSaved={setWorkspace} />
    </div>
  );
}
