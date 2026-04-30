/**
 * llm-step-executor.budget.test.ts
 *
 * Focused tests for BudgetExceededError class — F1a-01
 */

import { BudgetExceededError } from '../llm-step-executor';

describe('BudgetExceededError', () => {
  it('is an instance of Error', () => {
    const err = new BudgetExceededError(1.0, 2.5, 'workspace');
    expect(err).toBeInstanceOf(Error);
  });

  it('carries limitUsd, spentUsd, and scope', () => {
    const err = new BudgetExceededError(0.50, 0.75, 'department');
    expect(err.limitUsd).toBe(0.50);
    expect(err.spentUsd).toBe(0.75);
    expect(err.scope).toBe('department');
  });

  it('has name BudgetExceededError', () => {
    const err = new BudgetExceededError(1, 2, 'agency');
    expect(err.name).toBe('BudgetExceededError');
  });

  it('message includes formatted dollar amounts', () => {
    const err = new BudgetExceededError(1.5, 3.1415, 'workspace');
    expect(err.message).toContain('1.5000');
    expect(err.message).toContain('3.1415');
    expect(err.message).toContain('workspace');
  });
});
