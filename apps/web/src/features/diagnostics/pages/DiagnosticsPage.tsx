import { useStudioState } from '../../../lib/StudioStateContext';
import { GatewayHealthCard } from '../components/GatewayHealthCard';
import { GatewayLogsPanel } from '../components/GatewayLogsPanel';
import { ProtocolStatusPanel } from '../components/ProtocolStatusPanel';

export function DiagnosticsPage() {
  const { state } = useStudioState();

  return (
    <div className="space-y-4 p-4">
      <GatewayHealthCard ok={Boolean(state.runtime.health.ok)} />
      <ProtocolStatusPanel sessionsCount={state.runtime.sessions.payload?.length ?? 0} />
      <GatewayLogsPanel diagnostics={state.runtime.diagnostics as Record<string, unknown>} />
    </div>
  );
}
