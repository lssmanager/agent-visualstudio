import { useStudioState } from '../../../lib/StudioStateContext';
import { SessionsPanel } from '../components/SessionsPanel';

export function SessionsPage() {
  const { state } = useStudioState();

  return (
    <div className="p-4">
      <SessionsPanel sessions={state.runtime.sessions.payload ?? []} />
    </div>
  );
}
