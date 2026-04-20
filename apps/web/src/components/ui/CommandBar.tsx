import { useState, useEffect, useRef, useCallback } from 'react';
import { type LucideIcon } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  icon?: LucideIcon;
  action: () => void;
  group?: string;
}

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  placeholder?: string;
  commands: Command[];
}

export function CommandBar({ open, onClose, placeholder = 'Type a command\u2026', commands }: CommandBarProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()),
  );

  const groups = new Map<string, Command[]>();
  for (const cmd of filtered) {
    const g = cmd.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(cmd);
  }

  const flatList: Command[] = [];
  for (const cmds of groups.values()) {
    flatList.push(...cmds);
  }

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const execute = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(flatList.length, 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + flatList.length) % Math.max(flatList.length, 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[activeIndex]) execute(flatList[activeIndex]);
        return;
      }
    },
    [flatList, activeIndex, execute, onClose],
  );

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-xl rounded-xl border overflow-hidden"
        style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-primary)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full outline-none text-sm"
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              border: 'none',
              padding: 0,
            }}
          />
        </div>

        <div
          ref={listRef}
          className="overflow-y-auto"
          style={{ maxHeight: 320 }}
        >
          {flatList.length === 0 ? (
            <div
              className="px-4 py-6 text-center text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              No matching commands
            </div>
          ) : (
            Array.from(groups.entries()).map(([group, cmds]) => (
              <div key={group}>
                {group && (
                  <div
                    className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {group}
                  </div>
                )}
                {cmds.map((cmd) => {
                  flatIdx++;
                  const isActive = flatIdx === activeIndex;
                  const Icon = cmd.icon;
                  return (
                    <div
                      key={cmd.id}
                      data-active={isActive}
                      role="button"
                      tabIndex={-1}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                      style={{
                        background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                        color: 'var(--text-primary)',
                      }}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setActiveIndex(flatList.indexOf(cmd))}
                    >
                      {Icon && (
                        <Icon
                          size={16}
                          style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                        />
                      )}
                      <span className="text-sm truncate">{cmd.label}</span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
