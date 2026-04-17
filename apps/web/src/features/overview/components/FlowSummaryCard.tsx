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
        <p className="text-sm text-slate-400 text-center py-4">No flows configured</p>
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
                className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">{flow.name}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      flow.isEnabled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {flow.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {nodeNames.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {nodeNames.map((name, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        <span className="text-xs font-mono bg-white border border-slate-200 text-slate-600 rounded px-1.5 py-0.5">
                          {name}
                        </span>
                        {idx < nodeNames.length - 1 && (
                          <ArrowRight size={10} className="text-slate-300" />
                        )}
                      </span>
                    ))}
                    {(flow.nodes?.length ?? 0) > 4 && (
                      <span className="text-xs text-slate-400">+{(flow.nodes?.length ?? 0) - 4} more</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {flow.trigger && (
                    <span>Trigger: <span className="text-slate-600 font-mono">{flow.trigger}</span></span>
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
