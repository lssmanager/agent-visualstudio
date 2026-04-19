import type { FullSnapshot, SnapshotSpecs } from './snapshot';

export interface RollbackTarget {
  writeWorkspace: (data: Record<string, unknown>) => void;
  writeAgents: (data: Record<string, unknown>[]) => void;
  writeFlows: (data: Record<string, unknown>[]) => void;
  writeSkills: (data: Record<string, unknown>[]) => void;
  writePolicies: (data: Record<string, unknown>[]) => void;
}

/**
 * Restores workspace state from a snapshot.
 * The caller provides writer functions for each entity type.
 */
export function rollbackToSnapshot(snapshot: FullSnapshot, target: RollbackTarget): void {
  const specs = snapshot.specs;

  target.writeWorkspace(specs.workspace);
  target.writeAgents(specs.agents);
  target.writeFlows(specs.flows);
  target.writeSkills(specs.skills);
  target.writePolicies(specs.policies);
}
