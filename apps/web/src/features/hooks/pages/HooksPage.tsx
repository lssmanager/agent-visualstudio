import { useEffect, useState } from 'react';
import { Webhook, Plus, Trash2 } from 'lucide-react';

import { getHooks, createHook, updateHook, deleteHook } from '../../../lib/api';
import { PageHeader, EmptyState } from '../../../components';
import type { HookSpec } from '../../../lib/types';
import { HookEditor } from '../components/HookEditor';

export default function HooksPage() {
  const [hooks, setHooks] = useState<HookSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HookSpec | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setHooks(await getHooks());
    } catch {
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSave(input: Omit<HookSpec, 'id'> & { id?: string }) {
    if (input.id) {
      await updateHook(input.id, input);
    } else {
      await createHook(input);
    }
    setEditing(null);
    setCreating(false);
    await load();
  }

  async function handleDelete(id: string) {
    await deleteHook(id);
    await load();
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader title="Hooks" icon={Webhook} description="Automation triggers for runs, steps, and deployments" />
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading hooks...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Hooks" icon={Webhook} description="Automation triggers for runs, steps, and deployments" />
        <button
          onClick={() => { setCreating(true); setEditing(null); }}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={14} />
          New Hook
        </button>
      </div>

      {(creating || editing) && (
        <HookEditor
          hook={editing ?? undefined}
          onSave={handleSave}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {hooks.length === 0 && !creating ? (
        <EmptyState
          icon={Webhook}
          title="No hooks configured"
          description="Hooks let you automate actions like logging, approvals, webhooks, and notifications on key events."
        />
      ) : (
        <div className="space-y-2">
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="rounded-lg border p-3 flex items-center justify-between"
              style={{
                borderColor: 'var(--border-primary)',
                background: hook.enabled ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                opacity: hook.enabled ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: hook.enabled ? '#059669' : '#9ca3af' }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {hook.event}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: '#dbeafe', color: '#2563eb' }}
                    >
                      {hook.action}
                    </span>
                    {hook.priority != null && hook.priority !== 0 && (
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        priority: {hook.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                    {hook.id}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setEditing(hook); setCreating(false); }}
                  className="px-2 py-1 rounded text-[10px] font-medium"
                  style={{ color: 'var(--color-primary)', background: 'var(--color-primary-soft)' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(hook.id)}
                  className="p-1 rounded transition-colors"
                  style={{ color: '#dc2626' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
