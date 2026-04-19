import { Clock, CheckCircle, XCircle, Pause, Play, SkipForward } from 'lucide-react';

import type { RunStep } from '../../../lib/types';
import { StepBadge } from '../../../components/ui/StepBadge';

const STEP_ICONS: Record<string, typeof Clock> = {
  queued: Clock,
  running: Play,
  waiting_approval: Pause,
  completed: CheckCircle,
  failed: XCircle,
  skipped: SkipForward,
};

const NODE_TYPE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  agent: 'Agent',
  tool: 'Tool',
  condition: 'Condition',
  approval: 'Approval',
  end: 'End',
};

interface RunTimelineProps {
  steps: RunStep[];
  onStepClick?: (step: RunStep) => void;
  selectedStepId?: string;
}

export function RunTimeline({ steps, onStepClick, selectedStepId }: RunTimelineProps) {
  if (steps.length === 0) {
    return (
      <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        No steps executed yet
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div
        className="absolute left-4 top-2 bottom-2 w-0.5"
        style={{ background: 'var(--border-primary)' }}
      />

      <div className="space-y-1">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.status] ?? Clock;
          const isSelected = selectedStepId === step.id;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepClick?.(step)}
              className="relative w-full flex items-start gap-3 pl-2 pr-3 py-2 rounded-lg text-left transition-colors"
              style={{
                background: isSelected ? 'var(--color-primary-soft)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {/* Node icon */}
              <div
                className="relative z-10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: step.status === 'completed' ? '#d1fae5'
                    : step.status === 'running' ? '#dbeafe'
                    : step.status === 'failed' ? '#fee2e2'
                    : step.status === 'waiting_approval' ? '#fef3c7'
                    : 'var(--bg-tertiary)',
                }}
              >
                <Icon size={12} style={{
                  color: step.status === 'completed' ? '#059669'
                    : step.status === 'running' ? '#2563eb'
                    : step.status === 'failed' ? '#dc2626'
                    : step.status === 'waiting_approval' ? '#d97706'
                    : 'var(--text-muted)',
                }} />
              </div>

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {NODE_TYPE_LABELS[step.nodeType] ?? step.nodeType}
                  </span>
                  <StepBadge status={step.status} />
                </div>
                <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                  {step.agentId ? `Agent: ${step.agentId}` : `Node: ${step.nodeId}`}
                </div>
                {step.startedAt && (
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {new Date(step.startedAt).toLocaleTimeString()}
                    {step.completedAt && (
                      <> — {getDuration(step.startedAt, step.completedAt)}</>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
