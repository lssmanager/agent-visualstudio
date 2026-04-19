import { FlowSpec } from '../../../../lib/types';
import { DashboardWidget } from '../DashboardWidget';

interface FlowsHealthWidgetProps {
  flows: FlowSpec[];
}

export function FlowsHealthWidget({ flows }: FlowsHealthWidgetProps) {
  const displayed = flows.slice(0, 5);

  return (
    <DashboardWidget title="Flows health" chip="editable widget">
      {displayed.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No flows configured</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayed.map((flow) => {
            const nodeCount = flow.nodes?.length ?? 0;
            const edgeCount = flow.edges?.length ?? 0;
            const isHealthy = flow.isEnabled && nodeCount > 0;

            return (
              <div
                key={flow.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-secondary)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {flow.name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                    {nodeCount} nodes · {edgeCount} edges
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: isHealthy ? 'var(--tone-success-bg)' : 'var(--tone-warning-bg)',
                    color: isHealthy ? 'var(--tone-success-text)' : 'var(--tone-warning-text)',
                    border: `1px solid ${isHealthy ? 'var(--tone-success-border)' : 'var(--tone-warning-border)'}`,
                    flexShrink: 0,
                  }}
                >
                  {isHealthy ? 'Healthy' : 'Attention'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </DashboardWidget>
  );
}
