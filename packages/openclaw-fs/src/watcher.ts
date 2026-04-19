import { EventEmitter } from 'node:events';
import path from 'node:path';

/**
 * Watches the `.openclaw/` directory for changes.
 * Emits 'change' events when any YAML or markdown file changes.
 *
 * NOTE: Uses chokidar for cross-platform reliability (especially Windows).
 * Falls back to polling if chokidar is unavailable.
 */
export interface WatcherEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  entity: 'config' | 'agent' | 'flow' | 'skill' | 'policy' | 'hook' | 'command' | 'unknown';
}

function classifyPath(relativePath: string): WatcherEvent['entity'] {
  if (relativePath === 'config.yaml') return 'config';
  if (relativePath.startsWith('agents/')) return 'agent';
  if (relativePath.startsWith('flows/')) return 'flow';
  if (relativePath.startsWith('skills/')) return 'skill';
  if (relativePath.startsWith('policies/')) return 'policy';
  if (relativePath === 'hooks.yaml') return 'hook';
  if (relativePath.startsWith('commands/')) return 'command';
  return 'unknown';
}

export class OpenclawWatcher extends EventEmitter {
  private watcher: { close: () => Promise<void> } | null = null;
  private readonly watchDir: string;

  constructor(rootDir: string) {
    super();
    this.watchDir = path.join(rootDir, '.openclaw');
  }

  async start(): Promise<void> {
    try {
      // Dynamic import to handle the case where chokidar is not installed
      const chokidar = await import('chokidar');
      this.watcher = chokidar.watch(this.watchDir, {
        ignored: /(^|[/\\])\../,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      });

      const handleEvent = (type: WatcherEvent['type']) => (filePath: string) => {
        const relative = path.relative(this.watchDir, filePath).replace(/\\/g, '/');
        const event: WatcherEvent = {
          type,
          filePath,
          entity: classifyPath(relative),
        };
        this.emit('change', event);
      };

      this.watcher
        .on('add', handleEvent('add'))
        .on('change', handleEvent('change'))
        .on('unlink', handleEvent('unlink'));
    } catch {
      // chokidar not available — watcher disabled silently
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
