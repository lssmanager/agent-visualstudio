import { FlowSpec } from '../../../lib/types';
import { SectionCard } from '../../../components/ui/SectionCard';
import { GitBranch, ArrowRight } from 'lucide-react';

interface FlowSummaryCardProps {
  flows: FlowSpec[];
}

export function FlowSummaryCard({ flows }: FlowSummaryCardProps) {
  return (
    <SectionCard
      title="Flows"
      icon={<GitBranch size={16} />}
      description={`${flows.length} configured`}
    >
      {flows.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No flows configured</p>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => {
            const nodeNames = flow.nodes
              ?.slice(0, 4)
              .map((n) => n.id ?? n.type)
              ?? [];

            return (
              <div
                key={flow.id}
                className="rounded-lg border p-3 space-y-2"
                style={{
                  borderColor: 'var(--border-secondary)',
                  background: 'var(--bg-secondary)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{flow.name}</span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                    style={
                      flow.isEnabled
                        ? { borderColor: 'var(--tone-success-border)', background: 'var(--tone-success-bg)', color: 'var(--tone-success-text)' }
                        : { borderColor: 'var(--border-primary)', background: 'var(--card-bg)', color: 'var(--text-muted)' }
                    }
                  >
                    {flow.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {nodeNames.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {nodeNames.map((name, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        <span
                          className="text-xs font-mono border rounded px-1.5 py-0.5"
                          style={{
                            background: 'var(--card-bg)',
                            borderColor: 'var(--border-primary)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {name}
                        </span>
                        {idx < nodeNames.length - 1 && (
                          <ArrowRight size={10} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                        )}
                      </span>
                    ))}
                    {(flow.nodes?.length ?? 0) > 4 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{(flow.nodes?.length ?? 0) - 4} more</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {flow.trigger && (
                    <span>Trigger: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{flow.trigger}</span></span>
                  )}
                  <span>{flow.nodes?.length ?? 0} nodes</span>
                  <span>{flow.edges?.length ?? 0} edges</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
