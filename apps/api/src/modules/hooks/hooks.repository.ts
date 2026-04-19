import fs from 'node:fs';
import path from 'node:path';

import type { HookSpec } from '../../../../../packages/core-types/src';
import { studioConfig } from '../../config';

const HOOKS_FILE = () => path.join(studioConfig.workspaceRoot, '.openclaw-studio', 'hooks.spec.json');

export class HooksRepository {
  private read(): HookSpec[] {
    const file = HOOKS_FILE();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as HookSpec[];
    } catch {
      return [];
    }
  }

  private write(hooks: HookSpec[]): void {
    const file = HOOKS_FILE();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(hooks, null, 2), 'utf-8');
  }

  findAll(): HookSpec[] {
    return this.read();
  }

  findById(id: string): HookSpec | null {
    return this.read().find((h) => h.id === id) ?? null;
  }

  create(hook: HookSpec): HookSpec {
    const hooks = this.read();
    if (hooks.some((h) => h.id === hook.id)) {
      throw new Error(`Hook already exists: ${hook.id}`);
    }
    hooks.push(hook);
    this.write(hooks);
    return hook;
  }

  update(id: string, updates: Partial<HookSpec>): HookSpec | null {
    const hooks = this.read();
    const index = hooks.findIndex((h) => h.id === id);
    if (index < 0) return null;
    hooks[index] = { ...hooks[index], ...updates, id };
    this.write(hooks);
    return hooks[index];
  }

  remove(id: string): boolean {
    const hooks = this.read();
    const next = hooks.filter((h) => h.id !== id);
    if (next.length === hooks.length) return false;
    this.write(next);
    return true;
  }
}
