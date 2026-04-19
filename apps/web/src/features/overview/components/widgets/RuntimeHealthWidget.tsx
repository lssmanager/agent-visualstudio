import { DashboardWidget } from '../DashboardWidget';
import { ProgressBar } from '../ProgressBar';

interface RuntimeHealthWidgetProps {
  runtimeOk: boolean;
  diagnosticsCount: number;
}

export function RuntimeHealthWidget({ runtimeOk, diagnosticsCount }: RuntimeHealthWidgetProps) {
  const gatewayVal = runtimeOk ? 100 : 0;
  const hooksVal = runtimeOk ? 95 : 20;
  const policiesVal = runtimeOk ? 90 : 40;
  const deployVal = diagnosticsCount === 0 ? 100 : Math.max(0, 100 - diagnosticsCount * 15);

  return (
    <DashboardWidget title="Runtime health" chip="live">
      <ProgressBar label="Gateway" value={gatewayVal} max={100} tone={gatewayVal >= 80 ? 'success' : 'danger'} />
      <ProgressBar label="Hooks" value={hooksVal} max={100} tone={hooksVal >= 80 ? 'success' : 'warning'} />
      <ProgressBar label="Policies" value={policiesVal} max={100} tone={policiesVal >= 80 ? 'success' : 'warning'} />
      <ProgressBar label="Deploy sync" value={deployVal} max={100} tone={deployVal >= 80 ? 'success' : 'danger'} />
    </DashboardWidget>
  );
}
