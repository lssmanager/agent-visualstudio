import type { HookEvent, HookAction } from '../../../lib/types';

const EVENTS: { value: HookEvent; label: string }[] = [
  { value: 'before:run', label: 'Before Run' },
  { value: 'after:run', label: 'After Run' },
  { value: 'before:step', label: 'Before Step' },
  { value: 'after:step', label: 'After Step' },
  { value: 'on:error', label: 'On Error' },
  { value: 'on:approval', label: 'On Approval' },
  { value: 'before:deploy', label: 'Before Deploy' },
  { value: 'after:deploy', label: 'After Deploy' },
];

const ACTIONS: { value: HookAction; label: string; description: string }[] = [
  { value: 'log', label: 'Log', description: 'Write to audit log' },
  { value: 'approval', label: 'Approval', description: 'Require human approval' },
  { value: 'webhook', label: 'Webhook', description: 'Send HTTP POST' },
  { value: 'notify', label: 'Notify', description: 'Send notification' },
  { value: 'block', label: 'Block', description: 'Block the operation' },
];

interface HookEventSelectorProps {
  event: HookEvent;
  action: HookAction;
  onEventChange: (event: HookEvent) => void;
  onActionChange: (action: HookAction) => void;
}

export function HookEventSelector({ event, action, onEventChange, onActionChange }: HookEventSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Event</label>
        <select
          value={event}
          onChange={(e) => onEventChange(e.target.value as HookEvent)}
          className="w-full rounded border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
        >
          {EVENTS.map((ev) => (
            <option key={ev.value} value={ev.value}>{ev.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Action</label>
        <select
          value={action}
          onChange={(e) => onActionChange(e.target.value as HookAction)}
          className="w-full rounded border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
        >
          {ACTIONS.map((ac) => (
            <option key={ac.value} value={ac.value}>{ac.label} — {ac.description}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
