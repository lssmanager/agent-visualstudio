/**
 * settings.service.ts
 *
 * Business logic for Settings API (providers + n8n).
 * Injected into settings.routes.ts via factory function.
 *
 * Responsibilities:
 *  - List providers with hasKey (never exposes key value)
 *  - Save / delete API keys in SystemConfig
 *  - Test provider connectivity with a real 1-token call
 *  - Get / save / test n8n connection details
 */

import { PrismaClient } from '@prisma/client'
import { buildLLMClient } from '@agent-visualstudio/run-engine'
import { SystemConfigService } from '@agent-visualstudio/run-engine'
import { PROVIDER_MODELS, ProviderModelEntry } from '@agent-visualstudio/run-engine'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProviderSummary {
  id:          string
  name:        string
  requiresKey: boolean
  hasKey:      boolean   // true if stored in SystemConfig — value is NEVER returned
  keyEnv:      string | null
  freeInput:   boolean
  models:      string[]
}

export interface N8nConfigSummary {
  baseUrl:   string | null
  hasApiKey: boolean
}

export interface TestProviderResult {
  ok:         boolean
  model:      string
  latencyMs:  number
  error?:     string
}

export interface TestN8nResult {
  ok:            boolean
  workflowCount: number
  error?:        string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SettingsService {
  private readonly sysConfig: SystemConfigService

  constructor(private readonly prisma: PrismaClient) {
    this.sysConfig = new SystemConfigService(prisma)
  }

  // ── Providers ──────────────────────────────────────────────────────────────

  async listProviders(): Promise<ProviderSummary[]> {
    const stored = await this.sysConfig.getAll()

    return Object.entries(PROVIDER_MODELS).map(([id, entry]: [string, ProviderModelEntry]) => {
      const hasKey = entry.keyEnv !== null
        ? Boolean(stored[entry.keyEnv])
        : !entry.requiresKey  // local/OAuth providers always "have" a key

      return {
        id,
        name:        entry.label,
        requiresKey: entry.requiresKey,
        hasKey,
        keyEnv:      entry.keyEnv,
        freeInput:   entry.freeInput ?? false,
        models:      entry.models,
      }
    })
  }

  async saveProviderKey(providerId: string, apiKey: string): Promise<void> {
    const entry = PROVIDER_MODELS[providerId]
    if (!entry) throw new Error(`Unknown provider: ${providerId}`)
    if (!entry.keyEnv) throw new Error(`Provider ${providerId} does not use an API key`)
    await this.sysConfig.set(entry.keyEnv, apiKey)
  }

  async deleteProviderKey(providerId: string): Promise<void> {
    const entry = PROVIDER_MODELS[providerId]
    if (!entry) throw new Error(`Unknown provider: ${providerId}`)
    if (!entry.keyEnv) throw new Error(`Provider ${providerId} does not use an API key`)
    await this.sysConfig.delete(entry.keyEnv)
  }

  async testProvider(providerId: string, modelId: string): Promise<TestProviderResult> {
    const config = await this.sysConfig.getAll()
    const start  = Date.now()

    try {
      const client = buildLLMClient(modelId, { configOverride: config })
      const result = await client.chat(
        [{ role: 'user', content: 'Hi' }],
        [],
        { model: modelId, temperature: 0, maxTokens: 1 },
      )
      return {
        ok:        true,
        model:     result.model,
        latencyMs: Date.now() - start,
      }
    } catch (err) {
      return {
        ok:        false,
        model:     modelId,
        latencyMs: Date.now() - start,
        error:     err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ── n8n ────────────────────────────────────────────────────────────────────

  async getN8nConfig(): Promise<N8nConfigSummary> {
    const stored = await this.sysConfig.getAll()
    return {
      baseUrl:   stored['N8N_BASE_URL'] ?? null,
      hasApiKey: Boolean(stored['N8N_API_KEY']),
    }
  }

  async saveN8nConfig(baseUrl: string, apiKey: string): Promise<void> {
    await this.sysConfig.set('N8N_BASE_URL', baseUrl)
    await this.sysConfig.set('N8N_API_KEY',  apiKey)
  }

  async testN8n(): Promise<TestN8nResult> {
    const stored  = await this.sysConfig.getAll()
    const baseUrl = stored['N8N_BASE_URL'] ?? process.env['N8N_BASE_URL']
    const apiKey  = stored['N8N_API_KEY']  ?? process.env['N8N_API_KEY']

    if (!baseUrl) {
      return { ok: false, workflowCount: 0, error: 'N8N_BASE_URL is not configured' }
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['X-N8N-API-KEY'] = apiKey

      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/workflows?limit=1`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        return { ok: false, workflowCount: 0, error: `n8n responded ${res.status}: ${text}` }
      }

      const data = await res.json() as { count?: number; data?: unknown[] }
      const count = data.count ?? data.data?.length ?? 0

      return { ok: true, workflowCount: count }
    } catch (err) {
      return {
        ok:            false,
        workflowCount: 0,
        error:         err instanceof Error ? err.message : String(err),
      }
    }
  }
}
