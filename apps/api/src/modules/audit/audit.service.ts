import fs from 'node:fs';
import path from 'node:path';

import { studioConfig } from '../../config';

export interface AuditEntry {
  id: string;
  timestamp: string;
  resource: string;
  resourceId?: string;
  action: string;
  detail: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

const AUDIT_FILE = () => path.join(studioConfig.workspaceRoot, '.openclaw-studio', 'audit.log.json');

export class AuditService {
  private readLog(): AuditEntry[] {
    const file = AUDIT_FILE();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as AuditEntry[];
    } catch {
      return [];
    }
  }

  private writeLog(entries: AuditEntry[]): void {
    const file = AUDIT_FILE();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8');
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const full: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const entries = this.readLog();
    entries.push(full);
    // Keep last 1000 entries
    if (entries.length > 1000) entries.splice(0, entries.length - 1000);
    this.writeLog(entries);
    return full;
  }

  query(filters: { resource?: string; action?: string; from?: string; to?: string }): AuditEntry[] {
    let entries = this.readLog();

    if (filters.resource) {
      entries = entries.filter((e) => e.resource === filters.resource);
    }
    if (filters.action) {
      entries = entries.filter((e) => e.action === filters.action);
    }
    if (filters.from) {
      const fromDate = new Date(filters.from).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() >= fromDate);
    }
    if (filters.to) {
      const toDate = new Date(filters.to).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() <= toDate);
    }

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}
