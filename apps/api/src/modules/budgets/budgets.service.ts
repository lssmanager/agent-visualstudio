import fs from 'node:fs';
import path from 'node:path';

import { studioConfig } from '../../config';

export interface BudgetSpec {
  id: string;
  name: string;
  scope: 'workspace' | 'agent' | 'model';
  targetId?: string;
  limitUsd: number;
  periodDays: number;
  currentUsageUsd: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const BUDGETS_FILE = () => path.join(studioConfig.workspaceRoot, '.openclaw-studio', 'budgets.spec.json');

export class BudgetsService {
  private read(): BudgetSpec[] {
    const file = BUDGETS_FILE();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as BudgetSpec[];
    } catch {
      return [];
    }
  }

  private write(budgets: BudgetSpec[]): void {
    const file = BUDGETS_FILE();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(budgets, null, 2), 'utf-8');
  }

  findAll(): BudgetSpec[] {
    return this.read();
  }

  create(input: Omit<BudgetSpec, 'id' | 'currentUsageUsd' | 'createdAt' | 'updatedAt'> & { id?: string }): BudgetSpec {
    const now = new Date().toISOString();
    const budget: BudgetSpec = {
      id: input.id ?? `budget-${Date.now()}`,
      name: input.name,
      scope: input.scope,
      targetId: input.targetId,
      limitUsd: input.limitUsd,
      periodDays: input.periodDays,
      currentUsageUsd: 0,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    const budgets = this.read();
    budgets.push(budget);
    this.write(budgets);
    return budget;
  }

  update(id: string, updates: Partial<BudgetSpec>): BudgetSpec | null {
    const budgets = this.read();
    const index = budgets.findIndex((b) => b.id === id);
    if (index < 0) return null;
    budgets[index] = { ...budgets[index], ...updates, id, updatedAt: new Date().toISOString() };
    this.write(budgets);
    return budgets[index];
  }
}
