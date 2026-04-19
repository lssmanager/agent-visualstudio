import type { StepStatus, RunStatus } from '../../../lib/types';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  queued:            { bg: '#e5e7eb', text: '#6b7280', label: 'Queued' },
  running:           { bg: '#dbeafe', text: '#2563eb', label: 'Running' },
  waiting_approval:  { bg: '#fef3c7', text: '#d97706', label: 'Awaiting Approval' },
  completed:         { bg: '#d1fae5', text: '#059669', label: 'Completed' },
  failed:            { bg: '#fee2e2', text: '#dc2626', label: 'Failed' },
  cancelled:         { bg: '#f3f4f6', text: '#9ca3af', label: 'Cancelled' },
  skipped:           { bg: '#f3f4f6', text: '#9ca3af', label: 'Skipped' },
};

interface StepBadgeProps {
  status: StepStatus | RunStatus;
  size?: 'sm' | 'md';
}

export function StepBadge({ status, size = 'sm' }: StepBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.queued;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{ background: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
