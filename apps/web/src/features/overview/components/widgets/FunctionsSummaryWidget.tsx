import { DashboardWidget } from '../DashboardWidget';
import { ProgressBar } from '../ProgressBar';

interface FunctionsSummaryWidgetProps {
  agentCount: number;
  enabledAgentCount: number;
  profileCount: number;
  flowCount: number;
  enabledFlowCount: number;
  sessionCount: number;
}

export function FunctionsSummaryWidget({
  agentCount,
  enabledAgentCount,
  profileCount,
  flowCount,
  enabledFlowCount,
  sessionCount,
}: FunctionsSummaryWidgetProps) {
  return (
    <DashboardWidget title="Functions summary" chip="overview logic">
      <ProgressBar label="Agents" value={enabledAgentCount} max={Math.max(agentCount, 1)} tone="primary" />
      <ProgressBar label="Profiles" value={profileCount} max={Math.max(profileCount, 1)} tone="success" />
      <ProgressBar label="Flows" value={enabledFlowCount} max={Math.max(flowCount, 1)} tone="warning" />
      <ProgressBar label="Sessions" value={sessionCount} max={Math.max(sessionCount, 10)} tone="primary" />
    </DashboardWidget>
  );
}
