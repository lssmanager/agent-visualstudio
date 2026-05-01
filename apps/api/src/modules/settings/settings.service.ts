/**
 * settings.service.ts
 *
 * Acepta PrismaClient como dependencia inyectada (patrón global del repo).
 * Si no se pasa, usa el singleton `prisma` exportado por prisma.service
 * (ruta canónica del repo: modules/core/db/prisma.service).
 */
import type { PrismaClient } from '@prisma/client'
import { PROVIDER_MODELS } from '../../lib/provider-models'

// ── Errores tipados para el controller ───────────────────────────────────────
export class NotFoundError extends Error {
  readonly status = 404
  constructor(msg: string) { super(msg); this.name = 'NotFoundError' }
}
export class BadRequestError extends Error {
  readonly status = 400
  constructor(msg: string) { super(msg); this.name = 'BadRequestError' }
}

// ── Service ──────────────────────────────────────────────────────────────────
export class SettingsService {
  private readonly prisma: PrismaClient

  /**
   * @param prisma PrismaClient inyectado desde el caller (preferido).
   *   Si se omite, importa el singleton `prisma` de modules/core/db/prisma.service.
   *   Esto permite usar SettingsService() sin args (retrocompatible)
   *   y SettingsService(prisma) con inyección explícita.
   */
  constructor(prisma?: PrismaClient) {
    if (prisma) {
      this.prisma = prisma
    } else {
      // Lazy require para evitar ciclos — usa la ruta canónica del repo
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getPrisma } = require('../core/db/prisma.service') as { getPrisma: () => PrismaClient }
      this.prisma = getPrisma()
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async getSysConfig(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany()
    return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]))
  }

  private async setKey(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where:  { key },
      update: { value },
      create: { key, value },
    })
  }

  private async deleteKey(key: string): Promise<void> {
    await this.prisma.systemConfig.deleteMany({ where: { key } })
  }

  // ── providers ──────────────────────────────────────────────────────────────

  async listProviders() {
    const config = await this.getSysConfig()
    return Object.entries(PROVIDER_MODELS).map(([id, p]) => ({
      id,
      name:        p.label,
      requiresKey: p.requiresKey,
      hasKey:      p.keyEnv ? Boolean(config[p.keyEnv]) : false,
      baseURL:     null as string | null,
      models:      p.models,
      freeInput:   p.freeInput ?? false,
    }))
  }

  async setProviderKey(providerId: string, apiKey: string): Promise<void> {
    const provider = PROVIDER_MODELS[providerId]
    if (!provider)        throw new NotFoundError(`Provider '${providerId}' not found`)
    if (!provider.keyEnv) throw new BadRequestError(`Provider '${providerId}' does not use an API key`)
    await this.setKey(provider.keyEnv, apiKey)
  }

  async deleteProviderKey(providerId: string): Promise<void> {
    const provider = PROVIDER_MODELS[providerId]
    if (!provider)        throw new NotFoundError(`Provider '${providerId}' not found`)
    if (!provider.keyEnv) throw new BadRequestError(`Provider '${providerId}' does not use an API key`)
    await this.deleteKey(provider.keyEnv)
  }

  async testProvider(
    providerId: string,
    modelId: string,
  ): Promise<{ ok: boolean; model: string; latencyMs: number; error?: string }> {
    const provider = PROVIDER_MODELS[providerId]
    if (!provider) throw new NotFoundError(`Provider '${providerId}' not found`)

    const config = await this.getSysConfig()
    const start  = Date.now()
    try {
      const { buildLLMClient } = await import('@agent-visualstudio/run-engine')
      const client = buildLLMClient(modelId, { configOverride: config })
      await client.chat(
        [{ role: 'user', content: 'Reply with exactly: ok' }],
        { maxTokens: 5 },
      )
      return { ok: true, model: modelId, latencyMs: Date.now() - start }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, model: modelId, latencyMs: Date.now() - start, error: msg }
    }
  }

  // ── n8n ────────────────────────────────────────────────────────────────────

  async getN8n() {
    const config = await this.getSysConfig()
    return {
      baseUrl:   config['N8N_BASE_URL']  ?? null,
      hasApiKey: Boolean(config['N8N_API_KEY']),
    }
  }

  async setN8n(baseUrl: string, apiKey: string): Promise<void> {
    await Promise.all([
      this.setKey('N8N_BASE_URL', baseUrl),
      this.setKey('N8N_API_KEY',  apiKey),
    ])
  }

  async testN8n(): Promise<{ ok: boolean; workflowCount: number; error?: string }> {
    const config  = await this.getSysConfig()
    const baseUrl = config['N8N_BASE_URL']  ?? process.env['N8N_BASE_URL']
    const apiKey  = config['N8N_API_KEY']   ?? process.env['N8N_API_KEY']

    if (!baseUrl) return { ok: false, workflowCount: 0, error: 'N8N_BASE_URL not configured' }

    try {
      const url     = `${baseUrl.replace(/\/$/, '')}/api/v1/workflows?limit=1`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['X-N8N-API-KEY'] = apiKey

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) })
      if (!res.ok) throw new Error(`n8n responded ${res.status} ${res.statusText}`)

      const body = await res.json() as { data?: unknown[] }
      return { ok: true, workflowCount: body.data?.length ?? 0 }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, workflowCount: 0, error: msg }
    }
  }
}
