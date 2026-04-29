/**
 * n8n.types.ts
 *
 * Shared types for N8nService:
 *  - DTOs from the n8n REST API
 *  - SyncResult (return type of syncWorkflows)
 *  - N8nPrismaClient (duck-typed Prisma interface — avoids @prisma/client dep)
 */

// ── n8n REST API DTOs ─────────────────────────────────────────────────────

export interface N8nWorkflowNodeDto {
  type:        string;
  parameters?: {
    /** Webhook path segment. Example: 'my-hook' → URL /webhook/my-hook */
    path?:       string;
    /** HTTP method. Default: 'POST' */
    httpMethod?: string;
  };
}

export interface N8nWorkflowDto {
  id:      string;
  name:    string;
  /** true when the workflow is enabled in n8n */
  active:  boolean;
  nodes?:  N8nWorkflowNodeDto[];
}

export interface N8nApiListResponse {
  data: N8nWorkflowDto[];
}

// ── syncWorkflows() result ────────────────────────────────────────────────

export interface SyncResult {
  connectionId: string;
  /** Number of workflows successfully upserted (N8nWorkflow + Skill) */
  upserted:     number;
  /** Number of workflows skipped because active=false in n8n */
  skipped:      number;
  /** Per-workflow (or connection-level) errors that did not abort the sync */
  errors:       Array<{ workflowId: string; reason: string }>;
}

// ── Duck-typed Prisma interface ───────────────────────────────────────────
//
// Avoids importing @prisma/client directly.
// The generated PrismaClient satisfies this interface automatically.

export interface N8nConnectionRow {
  id:              string;
  baseUrl:         string;
  /** AES-256-GCM encrypted API key stored as hex string.
   *  Format: [12b IV][16b authTag][Nb ciphertext] */
  apiKeyEncrypted: string;
  isActive:        boolean;
}

export interface N8nPrismaClient {
  n8nConnection: {
    findUniqueOrThrow(args: {
      where: { id: string };
    }): Promise<N8nConnectionRow>;
  };
  n8nWorkflow: {
    upsert(args: {
      where:  { connectionId_n8nWorkflowId: { connectionId: string; n8nWorkflowId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
  skill: {
    upsert(args: {
      where:  { name: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
}
