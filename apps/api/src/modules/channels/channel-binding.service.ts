/**
 * channel-binding.service.ts — F3a-32
 *
 * fix(tsc): eliminar scopeId del DTO público.
 * scopeId era un campo eliminado del schema Prisma en v12+.
 * La lógica interna ya resolvía el scope desde externalChannelId/externalGuildId;
 * lo único que faltaba era limpiar la interfaz ResolvedBinding y el _toResolved.
 *
 * Cambios:
 *   - ResolvedBinding ya no expone `scopeId` (campo fantasma)
 *   - _toResolved no construye ni retorna scopeId
 *   - createBinding ya no pasa scopeId a Prisma (ese campo no existe en el schema)
 */

import { getPrisma } from '../../lib/prisma'

export interface CreateBindingDto {
  channelConfigId:    string
  agentId:            string
  externalChannelId?: string | null
  externalGuildId?:   string | null
  meta?:              Record<string, unknown>
}

export interface UpdateBindingDto {
  agentId?:           string
  externalChannelId?: string | null
  externalGuildId?:   string | null
  meta?:              Record<string, unknown>
}

export interface ResolveBindingQuery {
  channelId?: string | null
  guildId?:   string | null
}

/**
 * fix(tsc): ResolvedBinding ya no incluye scopeId.
 * El campo fue eliminado del schema en v12. El scope se deriva
 * en runtime desde externalChannelId y externalGuildId.
 * scopeLevel se conserva como metadata útil para el caller.
 */
export interface ResolvedBinding {
  id:                string
  channelConfigId:   string
  agentId:           string
  externalChannelId: string | null
  externalGuildId:   string | null
  scopeLevel:        'channel' | 'guild' | 'agent'
}

export class ChannelBindingService {
  private get db() { return getPrisma() }

  async create(dto: CreateBindingDto): Promise<ResolvedBinding> {
    const config = await this.db.channelConfig.findUnique({
      where: { id: dto.channelConfigId },
    })
    if (!config) {
      throw new Error(`ChannelConfig not found: ${dto.channelConfigId}`)
    }

    if (dto.externalChannelId) {
      const existing = await this.db.channelBinding.findFirst({
        where: {
          channelConfigId:   dto.channelConfigId,
          externalChannelId: dto.externalChannelId,
        },
      })
      if (existing) {
        throw new Error(
          `Binding already exists for externalChannelId '${dto.externalChannelId}' ` +
          `in channelConfig '${dto.channelConfigId}'.`,
        )
      }
    }

    // fix: no se pasa scopeId — ese campo fue eliminado del schema Prisma v12.
    // scopeLevel se inicializa como 'agent' (valor por defecto del campo en el schema).
    const binding = await this.db.channelBinding.create({
      data: {
        channelConfigId:   dto.channelConfigId,
        agentId:           dto.agentId,
        externalChannelId: dto.externalChannelId ?? null,
        externalGuildId:   dto.externalGuildId   ?? null,
        scopeLevel:        'agent',
      },
    })

    return this._toResolved(binding)
  }

  async list(channelConfigId: string): Promise<ResolvedBinding[]> {
    const bindings = await this.db.channelBinding.findMany({
      where:   { channelConfigId },
      orderBy: { createdAt: 'asc' },
    })
    return bindings.map((b: Parameters<typeof this._toResolved>[0]) => this._toResolved(b))
  }

  async getById(id: string): Promise<ResolvedBinding> {
    const binding = await this.db.channelBinding.findUnique({ where: { id } })
    if (!binding) throw new Error(`ChannelBinding not found: ${id}`)
    return this._toResolved(binding)
  }

  async resolve(
    channelConfigId: string,
    query: ResolveBindingQuery,
  ): Promise<ResolvedBinding | null> {
    if (query.channelId) {
      const b = await this.db.channelBinding.findFirst({
        where: { channelConfigId, externalChannelId: query.channelId },
      })
      if (b) return this._toResolved(b)
    }
    if (query.guildId) {
      const b = await this.db.channelBinding.findFirst({
        where: { channelConfigId, externalGuildId: query.guildId },
      })
      if (b) return this._toResolved(b)
    }
    return null
  }

  async findByExternalChannel(
    channelConfigId: string,
    externalChannelId: string,
  ): Promise<ResolvedBinding | null> {
    const b = await this.db.channelBinding.findFirst({
      where: { channelConfigId, externalChannelId },
    })
    return b ? this._toResolved(b) : null
  }

  async findByExternalGuild(
    channelConfigId: string,
    externalGuildId: string,
  ): Promise<ResolvedBinding | null> {
    const b = await this.db.channelBinding.findFirst({
      where: { channelConfigId, externalGuildId },
    })
    return b ? this._toResolved(b) : null
  }

  async update(id: string, dto: UpdateBindingDto): Promise<ResolvedBinding> {
    const existing = await this.db.channelBinding.findUnique({ where: { id } })
    if (!existing) throw new Error(`ChannelBinding not found: ${id}`)

    const updated = await this.db.channelBinding.update({
      where: { id },
      data: {
        ...(dto.agentId           !== undefined && { agentId:           dto.agentId }),
        ...(dto.externalChannelId !== undefined && { externalChannelId: dto.externalChannelId }),
        ...(dto.externalGuildId   !== undefined && { externalGuildId:   dto.externalGuildId }),
      },
    })
    return this._toResolved(updated)
  }

  async remove(id: string): Promise<void> {
    const existing = await this.db.channelBinding.findUnique({ where: { id } })
    if (!existing) throw new Error(`ChannelBinding not found: ${id}`)
    await this.db.channelBinding.delete({ where: { id } })
  }

  /**
   * fix(tsc): _toResolved ya no genera scopeId.
   * scopeLevel se deriva desde los campos de externalChannelId/externalGuildId.
   */
  private _toResolved(binding: {
    id:                string
    channelConfigId:   string
    agentId:           string
    externalChannelId: string | null
    externalGuildId:   string | null
    [key: string]: unknown
  }): ResolvedBinding {
    const scopeLevel: 'channel' | 'guild' | 'agent' =
      binding.externalChannelId ? 'channel'
      : binding.externalGuildId ? 'guild'
      : 'agent'

    return {
      id:                binding.id,
      channelConfigId:   binding.channelConfigId,
      agentId:           binding.agentId,
      externalChannelId: binding.externalChannelId,
      externalGuildId:   binding.externalGuildId,
      scopeLevel,
    }
  }
}
