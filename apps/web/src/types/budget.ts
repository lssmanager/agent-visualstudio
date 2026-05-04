export type BudgetScope = 'workspace' | 'agent' | 'channel';
export type BudgetAction = 'pause' | 'notify' | 'hard-stop';

export interface BudgetPolicy {
  id: string;
  scope: BudgetScope;
  scopeId: string;          // workspaceId | agentId | channelId
  scopeLabel?: string;      // nombre human-readable del target
  limitTokens?: number;     // undefined = sin límite de tokens
  limitUSD?: number;        // undefined = sin límite monetario
  action: BudgetAction;
  enabled: boolean;
  createdAt: string;
  /** usage data for progress bar (optional — populated when available) */
  usedTokens?: number;
  usedUSD?: number;
}
