/**
 * n8n-connections.service.ts
 *
 * CRUD sobre el modelo N8nConnection de Prisma.
 * Gestiona encrypt/decrypt del apiKey con @lss/crypto.
 *
 * Agent Visual Studio es usuario único — N8nConnection es una
 * conexión global al servidor n8n del usuario. Sin jerarquía.
 */

import { encrypt, decrypt } from '@lss/crypto';
import { prisma }           from '../../modules/core/db/prisma.service';

// ── DTOs ──────────────────────────────────────────────────────────────

export interface CreateN8nConnectionDto {
  name:      string;
  baseUrl:   string;
  /** Texto plano — se encripta antes de guardar */
  apiKey:    string;
  isActive?: boolean;
}

export interface UpdateN8nConnectionDto {
  name?:     string;
  baseUrl?:  string;
  /** Si se provee, se re-encripta antes de guardar */
  apiKey?:   string;
  isActive?: boolean;
}

/** Proyección segura — nunca expone apiKeyEncrypted */
export interface N8nConnectionView {
  id:            string;
  name:          string;
  baseUrl:       string;
  isActive:      boolean;
  createdAt:     Date;
  updatedAt:     Date;
  workflowCount: number;
}

// ── Service ───────────────────────────────────────────────────────────

export class N8nConnectionsService {
  private toView(row: any): N8nConnectionView {
    return {
      id:            row.id,
      name:          row.name,
      baseUrl:       row.baseUrl,
      isActive:      row.isActive,
      createdAt:     row.createdAt,
      updatedAt:     row.updatedAt,
      workflowCount: row._count?.workflows ?? 0,
    };
  }

  async list(): Promise<N8nConnectionView[]> {
    const rows = await prisma.n8nConnection.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { workflows: true } } },
    });
    return rows.map((row: any) => this.toView(row));
  }

  async findById(id: string): Promise<N8nConnectionView | null> {
    const row = await prisma.n8nConnection.findUnique({
      where:   { id },
      include: { _count: { select: { workflows: true } } },
    });
    return row ? this.toView(row) : null;
  }

  async create(dto: CreateN8nConnectionDto): Promise<N8nConnectionView> {
    const apiKeyEncrypted = encrypt(dto.apiKey);
    const row = await prisma.n8nConnection.create({
      data: {
        name:            dto.name,
        baseUrl:         dto.baseUrl.replace(/\/$/, ''),
        apiKeyEncrypted,
        isActive:        dto.isActive ?? true,
      },
      include: { _count: { select: { workflows: true } } },
    });
    return this.toView(row);
  }

  async update(
    id:  string,
    dto: UpdateN8nConnectionDto,
  ): Promise<N8nConnectionView | null> {
    const existing = await prisma.n8nConnection.findUnique({ where: { id } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (dto.name     !== undefined) data['name']            = dto.name;
    if (dto.baseUrl  !== undefined) data['baseUrl']         = dto.baseUrl.replace(/\/$/, '');
    if (dto.isActive !== undefined) data['isActive']        = dto.isActive;
    if (dto.apiKey   !== undefined) data['apiKeyEncrypted'] = encrypt(dto.apiKey);

    const row = await prisma.n8nConnection.update({
      where:   { id },
      data,
      include: { _count: { select: { workflows: true } } },
    });
    return this.toView(row);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await prisma.n8nConnection.findUnique({ where: { id } });
    if (!existing) return false;
    // Borrar workflows asociados antes de eliminar la conexión
    await prisma.n8nWorkflow.deleteMany({ where: { connectionId: id } });
    await prisma.n8nConnection.delete({ where: { id } });
    return true;
  }

  /**
   * Prueba conectividad real: desencripta apiKey y llama GET /api/v1/workflows.
   * Timeout: 8 segundos.
   */
  async testConnection(id: string): Promise<
    | { ok: true;  workflowCount: number }
    | { ok: false; error: string }
  > {
    const row = await prisma.n8nConnection.findUnique({ where: { id } });
    if (!row)          return { ok: false, error: 'Connection not found' };
    if (!row.isActive) return { ok: false, error: 'Connection is inactive' };

    let apiKey: string;
    try {
      apiKey = decrypt(row.apiKeyEncrypted);
    } catch {
      return { ok: false, error: 'Failed to decrypt API key' };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      let res: Response;
      try {
        res = await fetch(`${row.baseUrl}/api/v1/workflows`, {
          signal:  controller.signal,
          headers: { 'X-N8N-API-KEY': apiKey },
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) return { ok: false, error: `n8n API returned ${res.status}` };

      const body = await res.json() as { data?: unknown[] };
      return { ok: true, workflowCount: body.data?.length ?? 0 };
    } catch (err) {
      return {
        ok:    false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
