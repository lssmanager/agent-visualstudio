import fs from 'node:fs';
import path from 'node:path';

import type { RunSpec } from '../../core-types/src';

/**
 * Persists runs as individual JSON files in `.openclaw-studio/runs/`.
 */
export class RunRepository {
  private readonly runsDir: string;
  private cache = new Map<string, RunSpec>();

  constructor(rootDir: string) {
    this.runsDir = path.join(rootDir, '.openclaw-studio', 'runs');
    if (!fs.existsSync(this.runsDir)) {
      fs.mkdirSync(this.runsDir, { recursive: true });
    }
    this.loadAll();
  }

  findAll(): RunSpec[] {
    return Array.from(this.cache.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }

  findById(id: string): RunSpec | null {
    return this.cache.get(id) ?? null;
  }

  save(run: RunSpec): void {
    this.cache.set(run.id, run);
    const filePath = path.join(this.runsDir, `${run.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(run, null, 2), 'utf-8');
  }

  delete(id: string): boolean {
    if (!this.cache.has(id)) return false;
    this.cache.delete(id);
    const filePath = path.join(this.runsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  }

  private loadAll(): void {
    if (!fs.existsSync(this.runsDir)) return;
    const files = fs.readdirSync(this.runsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.runsDir, file), 'utf-8');
        const run = JSON.parse(content) as RunSpec;
        this.cache.set(run.id, run);
      } catch {
        // Skip corrupt files
      }
    }
  }
}
