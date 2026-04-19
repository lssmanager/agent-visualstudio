export interface VersionSnapshotSpecs {
  workspace: unknown;
  agents: unknown[];
  flows: unknown[];
  skills: unknown[];
  policies: unknown[];
}

export interface VersionSnapshot {
  id: string;
  workspaceId: string;
  label?: string;
  createdAt: string;
  parentId?: string;
  hash: string;
  specs: VersionSnapshotSpecs;
}
