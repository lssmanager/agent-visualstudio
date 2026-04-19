import crypto from 'node:crypto';

import type { HookSpec } from '../../../../../packages/core-types/src';

import { HooksRepository } from './hooks.repository';
import { HooksExecutor, HookContext } from './hooks.executor';

const repository = new HooksRepository();
const executor = new HooksExecutor();

export class HooksService {
  findAll(): HookSpec[] {
    return repository.findAll();
  }

  findById(id: string): HookSpec | null {
    return repository.findById(id);
  }

  create(input: Omit<HookSpec, 'id'> & { id?: string }): HookSpec {
    const hook: HookSpec = {
      id: input.id ?? crypto.randomUUID(),
      event: input.event,
      action: input.action,
      config: input.config ?? {},
      enabled: input.enabled ?? true,
      priority: input.priority,
    };
    return repository.create(hook);
  }

  update(id: string, updates: Partial<HookSpec>): HookSpec | null {
    return repository.update(id, updates);
  }

  remove(id: string): boolean {
    return repository.remove(id);
  }

  async trigger(context: HookContext): Promise<void> {
    const hooks = repository.findAll();
    await executor.execute(hooks, context);
  }
}
