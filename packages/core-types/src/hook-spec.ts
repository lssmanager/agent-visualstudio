export type HookEvent =
  | 'before:run'
  | 'after:run'
  | 'before:step'
  | 'after:step'
  | 'on:error'
  | 'on:approval'
  | 'before:deploy'
  | 'after:deploy';

export type HookAction = 'log' | 'approval' | 'webhook' | 'notify' | 'block';

export interface HookSpec {
  id: string;
  event: HookEvent;
  action: HookAction;
  config: Record<string, unknown>;
  enabled: boolean;
  priority?: number;
  createdAt?: string;
  updatedAt?: string;
}
