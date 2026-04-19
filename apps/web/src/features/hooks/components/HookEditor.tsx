import { useState } from 'react';

import type { HookSpec, HookEvent, HookAction } from '../../../lib/types';
import { HookEventSelector } from './HookEventSelector';

interface HookEditorProps {
  hook?: HookSpec;
  onSave: (hook: Omit<HookSpec, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}

export function HookEditor({ hook, onSave, onCancel }: HookEditorProps) {
  const [event, setEvent] = useState<HookEvent>(hook?.event ?? 'before:run');
  const [action, setAction] = useState<HookAction>(hook?.action ?? 'log');
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);
  const [priority, setPriority] = useState(hook?.priority ?? 0);
  const [webhookUrl, setWebhookUrl] = useState((hook?.config?.url as string) ?? '');
  const [message, setMessage] = useState((hook?.config?.message as string) ?? '');
  const [reason, setReason] = useState((hook?.config?.reason as string) ?? '');

  function handleSave() {
    const config: Record<string, unknown> = {};
    if (action === 'webhook') config.url = webhookUrl;
    if (action === 'notify') config.message = message;
    if (action === 'block') config.reason = reason;

    onSave({
      id: hook?.id,
      event,
      action,
      config,
      enabled,
      priority,
    });
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
    >
      <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {hook ? 'Edit Hook' : 'New Hook'}
      </h4>

      <HookEventSelector
        event={event}
        action={action}
        onEventChange={setEvent}
        onActionChange={setAction}
      />

      {/* Action-specific config */}
      {action === 'webhook' && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Webhook URL</label>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/hook"
            className="w-full rounded border px-2 py-1.5 text-xs font-mono"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
        </div>
      )}

      {action === 'notify' && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Message</label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Notification message"
            className="w-full rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
        </div>
      )}

      {action === 'block' && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Block Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for blocking"
            className="w-full rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Priority</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="rounded px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {hook ? 'Update' : 'Create'} Hook
        </button>
        <button
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs font-medium border"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
