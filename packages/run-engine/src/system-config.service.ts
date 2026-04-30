/**
 * system-config.service.ts
 *
 * CRUD service for SystemConfig — single-tenant admin settings.
 *
 * Usage (production — inject into route handlers or services):
 *   const svc = new SystemConfigService(prisma)
 *   const cfg = await svc.getAll()
 *   buildLLMClient('openai/gpt-4.1', { configOverride: cfg })
 *
 * Key naming convention matches PROVIDER_MODELS[*].keyEnv:
 *   'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'N8N_BASE_URL', ...
 */

import { PrismaClient } from '@prisma/client'

export class SystemConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Returns the stored value for `key`, or null if not set. */
  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } })
    return row?.value ?? null
  }

  /** Upserts a key/value pair in SystemConfig. */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where:  { key },
      update: { value },
      create: { key, value },
    })
  }

  /** Removes a key from SystemConfig. Falls back to process.env on next read. */
  async delete(key: string): Promise<void> {
    await this.prisma.systemConfig.deleteMany({ where: { key } })
  }

  /**
   * Returns all rows as a flat object suitable for `buildLLMClient` configOverride.
   * Example: { OPENAI_API_KEY: 'sk-...', N8N_BASE_URL: 'https://...' }
   */
  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany()
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }
}
