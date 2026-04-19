import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { VersionSnapshot } from '../../core-types/src';

export interface SnapshotSpecs {
  workspace: Record<string, unknown>;
  agents: Record<string, unknown>[];
  flows: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  policies: Record<string, unknown>[];
}

export interface FullSnapshot extends VersionSnapshot {
  specs: SnapshotSpecs;
}

/**
 * Creates and manages workspace snapshots.
 * Snapshots are stored as JSON files in `.openclaw-studio/versions/`.
 */
export class SnapshotManager {
  private readonly versionsDir: string;

  constructor(rootDir: string) {
    this.versionsDir = path.join(rootDir, '.openclaw-studio', 'versions');
    if (!fs.existsSync(this.versionsDir)) {
      fs.mkdirSync(this.versionsDir, { recursive: true });
    }
  }

  createSnapshot(specs: SnapshotSpecs, workspaceId: string, label?: string, parentId?: string): FullSnapshot {
    const content = JSON.stringify(specs, null, 2);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);

    const snapshot: FullSnapshot = {
      id: crypto.randomUUID(),
      workspaceId,
      label,
      createdAt: new Date().toISOString(),
      parentId,
      hash,
      specs,
    };

    fs.writeFileSync(
      path.join(this.versionsDir, `${snapshot.id}.json`),
      JSON.stringify(snapshot, null, 2),
      'utf-8',
    );

    return snapshot;
  }

  listSnapshots(): VersionSnapshot[] {
    if (!fs.existsSync(this.versionsDir)) return [];
    return fs.readdirSync(this.versionsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.versionsDir, f), 'utf-8'));
          // Return without specs for list view
          const { specs, ...meta } = data;
          return meta as VersionSnapshot;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime()) as VersionSnapshot[];
  }

  getSnapshot(id: string): FullSnapshot | null {
    const file = path.join(this.versionsDir, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as FullSnapshot;
    } catch {
      return null;
    }
  }
}
