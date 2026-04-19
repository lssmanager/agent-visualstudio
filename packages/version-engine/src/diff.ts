import type { SnapshotSpecs } from './snapshot';

export interface DiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  before?: unknown;
  after?: unknown;
}

/**
 * Compares a snapshot's specs against the current workspace state.
 * Returns a list of structural changes.
 */
export function diffSpecs(snapshotSpecs: SnapshotSpecs, currentSpecs: SnapshotSpecs): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  // Diff workspace
  if (JSON.stringify(snapshotSpecs.workspace) !== JSON.stringify(currentSpecs.workspace)) {
    diffs.push({
      path: 'workspace',
      type: 'changed',
      before: snapshotSpecs.workspace,
      after: currentSpecs.workspace,
    });
  }

  // Diff entity arrays
  diffEntityArray(diffs, 'agents', snapshotSpecs.agents, currentSpecs.agents);
  diffEntityArray(diffs, 'flows', snapshotSpecs.flows, currentSpecs.flows);
  diffEntityArray(diffs, 'skills', snapshotSpecs.skills, currentSpecs.skills);
  diffEntityArray(diffs, 'policies', snapshotSpecs.policies, currentSpecs.policies);

  return diffs;
}

function diffEntityArray(
  diffs: DiffEntry[],
  collection: string,
  before: Record<string, unknown>[],
  after: Record<string, unknown>[],
): void {
  const beforeMap = new Map(before.map((e) => [e.id as string, e]));
  const afterMap = new Map(after.map((e) => [e.id as string, e]));

  // Removed
  for (const [id, entity] of beforeMap) {
    if (!afterMap.has(id)) {
      diffs.push({ path: `${collection}/${id}`, type: 'removed', before: entity });
    }
  }

  // Added
  for (const [id, entity] of afterMap) {
    if (!beforeMap.has(id)) {
      diffs.push({ path: `${collection}/${id}`, type: 'added', after: entity });
    }
  }

  // Changed
  for (const [id, beforeEntity] of beforeMap) {
    const afterEntity = afterMap.get(id);
    if (afterEntity && JSON.stringify(beforeEntity) !== JSON.stringify(afterEntity)) {
      diffs.push({
        path: `${collection}/${id}`,
        type: 'changed',
        before: beforeEntity,
        after: afterEntity,
      });
    }
  }
}
