/**
 * agent-resolver.service.ts — [F3a-06]
 *
 * Resuelve el agentId que debe atender un mensaje inbound
 * a partir del contexto (channelConfigId + scope del usuario).
 *
 * Algoritmo de resolución:
 *  1. Buscar todos los ChannelBinding habilitados para el channelConfigId
 *  2. Aplicar reglas de prioridad en este orden:
 *       a) scope='user'      + scopeValue = externalUserId  → prioridad máxima
 *       b) scope='tenant'    + scopeValue = tenantId        (si ctx.tenantId existe)
 *       c) scope='workspace' + scopeValue = workspaceId     (si ctx.workspaceId existe)
 *       d) scope='default'   + scopeValue = null            → fallback
 *  3. Si ningún binding coincide → fallback a ChannelConfig.agentId (modo legacy)
 *  4. Si ChannelConfig tampoco tiene agentId → lanzar AgentResolutionError
 *
 * Caché:
 *   Los bindings se cachean por channelConfigId con TTL de 5 minutos.
 *   invalidateCache() existe para tests y para cuando se actualice un binding.
 *
 * Clase completamente pura respecto al canal — no importa nada de channels/.
 */

import type { PrismaClient } from '@prisma/client'
import type {
  AgentResolutionContext,
  AgentResolutionResult,
  BindingScope,
} from './agent-resolver.types.js'

// ── Error tipado ────────────────────────────────────────────────────────

export class AgentResolutionError extends Error {
  constructor(
    public readonly channelConfigId: string,
    public readonly context: AgentResolutionContext,
  ) {
    super(
      `[AgentResolver] No agent found for channel '${channelConfigId}' ` +
      `with context: user=${context.externalUserId}, ` +
      `workspace=${context.workspaceId ?? 'none'}, ` +
      `tenant=${context.tenantId ?? 'none'}`,
    )
    this.name = 'AgentResolutionError'
  }
}

// ── Tipos internos ──────────────────────────────────────────────────────

interface CachedBindings {
  bindings:  ChannelBindingRow[]
  fetchedAt: number
}

interface ChannelBindingRow {
  id:         string
  agentId:    string
  scope:      string
  scopeValue: string | null
  priority:   number
  enabled:    boolean
}

const CACHE_TTL_MS = 5 * 60 * 1_000   // 5 minutos

// Orden de precedencia de scopes (menor índice = mayor prioridad)
const SCOPE_PRIORITY: BindingScope[] = ['user', 'tenant', 'workspace', 'default']

// ── AgentResolver ───────────────────────────────────────────────────────

export class AgentResolver {

  private readonly cache = new Map<string, CachedBindings>()

  constructor(private readonly db: PrismaClient) {}

  // ── resolve() ─────────────────────────────────────────────────────────

  /**
   * Punto de entrada principal.
   *
   * @throws AgentResolutionError si no hay ningún binding ni agentId en config
   */
  async resolve(
    ctx:             AgentResolutionContext,
    configAgentId?:  string,   // cfg.agentId de DecryptedChannelConfig (fallback legacy)
  ): Promise<AgentResolutionResult> {

    const bindings = await this.loadBindings(ctx.channelConfigId)

    // Intentar cada scope en orden de prioridad
    for (const scope of SCOPE_PRIORITY) {
      const match = this.findMatch(bindings, scope, ctx)
      if (match) {
        return {
          agentId:    match.agentId,
          resolvedBy: scope,
          bindingId:  match.id,
        }
      }
    }

    // Fallback legacy: usar agentId de ChannelConfig
    if (configAgentId) {
      return {
        agentId:    configAgentId,
        resolvedBy: 'config',
      }
    }

    throw new AgentResolutionError(ctx.channelConfigId, ctx)
  }

  // ── resolveOrNull() ────────────────────────────────────────────────────

  /**
   * Versión que no lanza — devuelve null si no puede resolver.
   * Útil para validaciones y health checks.
   */
  async resolveOrNull(
    ctx:            AgentResolutionContext,
    configAgentId?: string,
  ): Promise<AgentResolutionResult | null> {
    try {
      return await this.resolve(ctx, configAgentId)
    } catch (err) {
      if (err instanceof AgentResolutionError) return null
      throw err
    }
  }

  // ── listBindings() ────────────────────────────────────────────────────

  /**
   * Retorna todos los bindings habilitados para un canal.
   * Útil para el admin UI de configuración de canales.
   */
  async listBindings(channelConfigId: string): Promise<ChannelBindingRow[]> {
    return this.loadBindings(channelConfigId)
  }

  // ── createBinding() ──────────────────────────────────────────────────

  /**
   * Crea un nuevo ChannelBinding y limpia la caché del canal.
   * Llamado desde el admin controller cuando se configura un canal.
   */
  async createBinding(data: {
    channelConfigId: string
    agentId:         string
    scope:           BindingScope
    scopeValue?:     string
    priority?:       number
  }): Promise<ChannelBindingRow> {
    if (data.scope !== 'default' && !data.scopeValue) {
      throw new Error(
        `[AgentResolver] scopeValue is required for scope '${data.scope}'`,
      )
    }
    if (data.scope === 'default' && data.scopeValue) {
      throw new Error(
        `[AgentResolver] scopeValue must be null/undefined for scope 'default'`,
      )
    }

    const row = await (this.db as any).channelBinding.create({
      data: {
        channelConfigId: data.channelConfigId,
        agentId:         data.agentId,
        scope:           data.scope,
        scopeValue:      data.scopeValue ?? null,
        priority:        data.priority   ?? 0,
        enabled:         true,
      },
    })

    // Invalidar caché para que el próximo resolve lo vea
    this.invalidateCache(data.channelConfigId)

    return row as ChannelBindingRow
  }

  // ── deleteBinding() ──────────────────────────────────────────────────

  async deleteBinding(bindingId: string, channelConfigId: string): Promise<void> {
    await (this.db as any).channelBinding.delete({ where: { id: bindingId } })
    this.invalidateCache(channelConfigId)
  }

  // ── invalidateCache() ─────────────────────────────────────────────────

  /** Forzar re-fetch en el próximo resolve() para un canal. */
  invalidateCache(channelConfigId: string): void {
    this.cache.delete(channelConfigId)
  }

  /** Limpiar toda la caché (útil para tests). */
  clearCache(): void {
    this.cache.clear()
  }

  // ── Privados ───────────────────────────────────────────────────────────

  private async loadBindings(channelConfigId: string): Promise<ChannelBindingRow[]> {
    const cached = this.cache.get(channelConfigId)

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.bindings
    }

    const rows = await (this.db as any).channelBinding.findMany({
      where:   { channelConfigId, enabled: true },
      orderBy: [
        { priority: 'desc' },  // mayor priority primero dentro del mismo scope
        { createdAt: 'asc'  },
      ],
    }) as ChannelBindingRow[]

    this.cache.set(channelConfigId, { bindings: rows, fetchedAt: Date.now() })
    return rows
  }

  private findMatch(
    bindings:   ChannelBindingRow[],
    scope:      BindingScope,
    ctx:        AgentResolutionContext,
  ): ChannelBindingRow | null {

    const scopeValue = this.getScopeValue(scope, ctx)

    // scope='default' no necesita scopeValue
    if (scope === 'default') {
      return bindings.find(
        (b) => b.scope === 'default' && b.scopeValue === null,
      ) ?? null
    }

    // Para scopes dinámicos, si no hay valor en el contexto → no puede coincidir
    if (scopeValue === null) return null

    return bindings.find(
      (b) => b.scope === scope && b.scopeValue === scopeValue,
    ) ?? null
  }

  private getScopeValue(scope: BindingScope, ctx: AgentResolutionContext): string | null {
    switch (scope) {
      case 'user':      return ctx.externalUserId
      case 'tenant':    return ctx.tenantId    ?? null
      case 'workspace': return ctx.workspaceId ?? null
      case 'default':   return null
    }
  }
}
