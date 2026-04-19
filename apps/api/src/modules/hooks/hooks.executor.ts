import type { HookSpec, HookEvent } from '../../../../../packages/core-types/src';
import { AuditService } from '../audit/audit.service';

const auditService = new AuditService();

export interface HookContext {
  event: HookEvent;
  runId?: string;
  stepId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Executes hooks that match a given event.
 * Actions: log, approval, webhook, notify, block.
 */
export class HooksExecutor {
  async execute(hooks: HookSpec[], context: HookContext): Promise<void> {
    const matching = hooks
      .filter((h) => h.enabled && h.event === context.event)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const hook of matching) {
      await this.executeAction(hook, context);
    }
  }

  private async executeAction(hook: HookSpec, context: HookContext): Promise<void> {
    switch (hook.action) {
      case 'log':
        auditService.log({
          resource: 'hook',
          resourceId: hook.id,
          action: context.event,
          detail: `Hook "${hook.id}" triggered on ${context.event}`,
          metadata: { runId: context.runId, stepId: context.stepId, ...context.payload },
        });
        break;

      case 'webhook': {
        const url = hook.config.url as string | undefined;
        if (url) {
          try {
            await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ event: context.event, hookId: hook.id, ...context.payload }),
            });
          } catch {
            // Webhook delivery failed — log but don't block
            auditService.log({
              resource: 'hook',
              resourceId: hook.id,
              action: 'webhook_failed',
              detail: `Webhook delivery to ${url} failed`,
            });
          }
        }
        break;
      }

      case 'notify':
        auditService.log({
          resource: 'hook',
          resourceId: hook.id,
          action: 'notification',
          detail: `Notification: ${hook.config.message ?? context.event}`,
          metadata: context.payload,
        });
        break;

      case 'block':
        throw new Error(`Blocked by hook "${hook.id}": ${hook.config.reason ?? 'no reason provided'}`);

      case 'approval':
        // Approval actions are handled by the run engine's approval queue
        break;
    }
  }
}
