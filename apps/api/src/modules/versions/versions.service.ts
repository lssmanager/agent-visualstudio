import type { VersionSnapshot } from '../../../../../packages/core-types/src';
import { SnapshotManager, diffSpecs, rollbackToSnapshot, type SnapshotSpecs } from '../../../../../packages/version-engine/src';
import { workspaceStore, studioConfig } from '../../config';

const snapshotManager = new SnapshotManager(studioConfig.workspaceRoot);

function buildCurrentSpecs(): SnapshotSpecs {
  const workspace = workspaceStore.readWorkspace();
  return {
    workspace: workspace ? JSON.parse(JSON.stringify(workspace)) : {},
    agents: workspaceStore.listAgents().map((a) => JSON.parse(JSON.stringify(a))),
    flows: workspaceStore.listFlows().map((f) => JSON.parse(JSON.stringify(f))),
    skills: workspaceStore.listSkills().map((s) => JSON.parse(JSON.stringify(s))),
    policies: workspaceStore.listPolicies().map((p) => JSON.parse(JSON.stringify(p))),
  };
}

export class VersionsService {
  listSnapshots(): VersionSnapshot[] {
    return snapshotManager.listSnapshots();
  }

  getSnapshot(id: string): VersionSnapshot | null {
    return snapshotManager.getSnapshot(id);
  }

  createSnapshot(label?: string): VersionSnapshot {
    const workspace = workspaceStore.readWorkspace();
    const specs = buildCurrentSpecs();

    const latest = snapshotManager.listSnapshots()[0];
    return snapshotManager.createSnapshot(specs, workspace?.id ?? 'default', label, latest?.id);
  }

  getDiff(snapshotId: string) {
    const snapshot = snapshotManager.getSnapshot(snapshotId);
    if (!snapshot) return null;

    const currentSpecs = buildCurrentSpecs();
    return {
      snapshotId,
      snapshotLabel: snapshot.label,
      snapshotCreatedAt: snapshot.createdAt,
      diffs: diffSpecs(snapshot.specs, currentSpecs),
    };
  }

  rollback(snapshotId: string): boolean {
    const snapshot = snapshotManager.getSnapshot(snapshotId);
    if (!snapshot) return false;

    rollbackToSnapshot(snapshot, {
      writeWorkspace: (data) => workspaceStore.writeWorkspace(data as any),
      writeAgents: (data) => workspaceStore.saveAgents(data as any),
      writeFlows: (data) => workspaceStore.saveFlows(data as any),
      writeSkills: (data) => workspaceStore.saveSkills(data as any),
      writePolicies: (data) => workspaceStore.savePolicies(data as any),
    });

    return true;
  }

  publish(label: string, notes?: string): VersionSnapshot {
    const snapshot = this.createSnapshot(label);
    // In production this would push to a registry/remote; for now it's a labeled snapshot
    return snapshot;
  }

  importWorkspace(data: {
    workspace: Record<string, unknown>;
    agents: Record<string, unknown>[];
    flows: Record<string, unknown>[];
    skills: Record<string, unknown>[];
    policies: Record<string, unknown>[];
  }): { ok: boolean; snapshotId: string } {
    // Save imported data as current state
    workspaceStore.writeWorkspace(data.workspace as any);
    workspaceStore.saveAgents(data.agents as any);
    workspaceStore.saveFlows(data.flows as any);
    workspaceStore.saveSkills(data.skills as any);
    workspaceStore.savePolicies(data.policies as any);

    // Create a snapshot of the imported state
    const snapshot = this.createSnapshot('Imported workspace');
    return { ok: true, snapshotId: snapshot.id };
  }
}
