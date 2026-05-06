import { Injectable }    from '@nestjs/common'
import { PrismaService } from './prisma/prisma.service'
import {
  ChannelBindingNotFoundError,
  ChannelConfigInactiveError,
  AmbiguousBindingError,
} from './agent-resolver.errors'

// ── Constantes ───────────────────────────────────────────────────────────────

/**
 * Orden numérico de prioridad: mayor número = mayor especificidad = se prefiere.
 * Un binding de scope 'agent' (4) tiene prioridad sobre 'agency' (1).
 */
const SCOPE_PRIORITY: Record<string, number> = {
  agency:     1,
  department: 2,
  workspace:  3,
  agent:      4,
} as const

// ── TTL del caché de bindings (5 minutos) ──────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1_000

// ── Tipos internos ────────────────────────────────────────────────────────────

export interface ResolvedAgent {
  agentId:    string
  scopeLevel: string
  scopeId:    string
  bindingId:  string
  isDefault:  boolean
}

export interface BindingRow {
  id:         string
  agentId:    string
  scopeLevel: string
  scopeId:    string
  isDefault:  boolean
}

interface CacheEntry {
  bindings:  BindingRow[]
  cachedAt:  number
}

// ── Servicio ───────────────────────────────────────────────────────────────

@Injectable()
export class AgentResolverService {
  private readonly bindingsCache = new Map<string, CacheEntry>()

  constructor(private readonly db: PrismaService) {}

  /**
   * Resuelve el agentId que debe manejar un mensaje entrante.
   *
   * Prioridad de resolución:
   *   1. Si la sesión ya existe y tiene agentId asignado →
   *      conservar ese agentId (sticky session).
   *   2. Si hay exactamente 1 binding → usar ese.
   *   3. Si hay un binding con isDefault=true → usar ese.
   *   4. Ordenar por SCOPE_PRIORITY (agent > workspace > department > agency)
   *      y usar el de mayor prioridad.
   *   5. Si hay empate en prioridad y ninguno es isDefault → AmbiguousBindingError.
   *   6. Si no hay bindings → ChannelBindingNotFoundError.
   */
  async resolve(
    channelConfigId: string,
    externalUserId:  string,
    existingAgentId: string | null = null,
  ): Promise<ResolvedAgent> {
    // ── 1. Sticky session: conservar agente de sesión activa ─────────────
    if (existingAgentId) {
      const binding = await this.findBindingForAgent(channelConfigId, existingAgentId)
      if (binding) {
        return {
          agentId:    existingAgentId,
          scopeLevel: binding.scopeLevel,
          scopeId:    binding.scopeId,
          bindingId:  binding.id,
          isDefault:  binding.isDefault,
        }
      }
      // El binding fue eliminado → re-resolver sin sticky
    }

    // ── 2. Cargar todos los bindings activos del canal ──────────────────
    const bindings = await this.loadBindings(channelConfigId)

    if (bindings.length === 0) {
      throw new ChannelBindingNotFoundError(channelConfigId)
    }

    // ── 3. Un solo binding → directo ────────────────────────────────
    if (bindings.length === 1) {
      const b = bindings[0]
      return { agentId: b.agentId, scopeLevel: b.scopeLevel, scopeId: b.scopeId, bindingId: b.id, isDefault: b.isDefault }
    }

    // ── 4. Binding marcado isDefault → usar ese ──────────────────────
    const defaultBindings = bindings.filter((b) => b.isDefault)
    if (defaultBindings.length > 1) {
      throw new AmbiguousBindingError(
        channelConfigId,
        defaultBindings.map((b) => b.agentId),
      )
    }

    const defaultBinding = defaultBindings[0]
    if (defaultBinding) {
      return {
        agentId:    defaultBinding.agentId,
        scopeLevel: defaultBinding.scopeLevel,
        scopeId:    defaultBinding.scopeId,
        bindingId:  defaultBinding.id,
        isDefault:  true,
      }
    }

    // ── 5. Ordenar por prioridad de scope ────────────────────────────
    const sorted = [...bindings].sort((a, b) => {
      const pa = SCOPE_PRIORITY[a.scopeLevel] ?? 0
      const pb = SCOPE_PRIORITY[b.scopeLevel] ?? 0
      return pb - pa  // descendente: mayor prioridad primero
    })

    const topPriority = SCOPE_PRIORITY[sorted[0].scopeLevel] ?? 0
    const topCandidates = sorted.filter(
      (b) => (SCOPE_PRIORITY[b.scopeLevel] ?? 0) === topPriority,
    )

    // ── 6. Empate sin isDefault → AmbiguousBindingError ───────────────
    if (topCandidates.length > 1) {
      throw new AmbiguousBindingError(
        channelConfigId,
        topCandidates.map((b) => b.agentId),
      )
    }

    const winner = sorted[0]
    return {
      agentId:    winner.agentId,
      scopeLevel: winner.scopeLevel,
      scopeId:    winner.scopeId,
      bindingId:  winner.id,
      isDefault:  winner.isDefault,
    }
  }

  /**
   * Invalida el caché de bindings para un canal.
   * Llamar desde el handler de POST/PATCH/DELETE /channels/:id/bindings.
   */
  invalidateCache(channelConfigId: string): void {
    this.bindingsCache.delete(channelConfigId)
  }

  /**
   * Devuelve todos los bindings de un canal (para la UI admin).
   */
  async listBindings(channelConfigId: string): Promise<BindingRow[]> {
    return this.db.channelBinding.findMany({
      where: { channelConfigId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    })
  }

  // ── Privados ────────────────────────────────────────────────────────────

  private async loadBindings(channelConfigId: string): Promise<BindingRow[]> {
    const cached = this.bindingsCache.get(channelConfigId)
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.bindings
    }

    // Verificar que el ChannelConfig esté activo
    const config = await this.db.channelConfig.findUniqueOrThrow({
      where:  { id: channelConfigId },
      select: { isActive: true },
    })
    if (!config.isActive) {
      throw new ChannelConfigInactiveError(channelConfigId)
    }

    const bindings = await this.db.channelBinding.findMany({
      where: { channelConfigId },
      select: {
        id:         true,
        agentId:    true,
        scopeLevel: true,
        scopeId:    true,
        isDefault:  true,
      },
    })

    this.bindingsCache.set(channelConfigId, { bindings, cachedAt: Date.now() })
    return bindings
  }

  private async findBindingForAgent(
    channelConfigId: string,
    agentId:         string,
  ): Promise<BindingRow | null> {
    const bindings = await this.loadBindings(channelConfigId).catch(() => [])
    return bindings.find((b) => b.agentId === agentId) ?? null
  }
}
