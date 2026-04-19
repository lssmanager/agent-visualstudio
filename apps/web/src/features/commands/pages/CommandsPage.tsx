import { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';

import { getCommands } from '../../../lib/api';
import { PageHeader } from '../../../components';

interface CommandSpec {
  id: string;
  name: string;
  description: string;
  steps: string[];
  tags?: string[];
}

export function CommandsPage() {
  const [commands, setCommands] = useState<CommandSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CommandSpec | null>(null);

  useEffect(() => {
    getCommands()
      .then(setCommands)
      .catch(() => setCommands([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader title="Commands" icon={Terminal} description="Reusable routines and command templates" />
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading commands...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Commands" icon={Terminal} description="Reusable routines and command templates" />

      {commands.length === 0 ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
        >
          <Terminal size={48} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>No commands found</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Add <code>.md</code> files to <code>.openclaw/commands/</code> to define reusable routines.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Command list */}
          <div className="md:col-span-1 space-y-2">
            {commands.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => setSelected(cmd)}
                className="w-full text-left rounded-lg border p-3 transition-colors"
                style={{
                  borderColor: selected?.id === cmd.id ? 'var(--color-primary)' : 'var(--border-primary)',
                  background: selected?.id === cmd.id ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                }}
              >
                <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  {cmd.name}
                </div>
                <div className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                  {cmd.description.slice(0, 120)}
                </div>
                {cmd.steps.length > 0 && (
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {cmd.steps.length} step{cmd.steps.length !== 1 ? 's' : ''}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Command detail */}
          <div className="md:col-span-2">
            {selected ? (
              <div
                className="rounded-lg border p-5"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {selected.name}
                </h2>
                <div className="text-sm whitespace-pre-wrap mb-4" style={{ color: 'var(--text-muted)' }}>
                  {selected.description}
                </div>
                {selected.steps.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Steps</h3>
                    <ol className="list-decimal list-inside space-y-1">
                      {selected.steps.map((step, i) => (
                        <li key={i} className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="rounded-lg border p-8 text-center"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Select a command to view its details
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
