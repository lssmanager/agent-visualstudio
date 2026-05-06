/**
 * channel-binding.service.ts — F3a-32
 *
 * Fix tsc: reemplaza import NestJS de getPrisma con la versión Express
 * (apps/api/src/lib/prisma.ts) que ya existe como singleton.
 * Se elimina @Injectable() — este servicio se instancia manualmente
 * en los controllers Express (patrón del repo).
 */

import { getPrisma } from '../../lib/prisma.js'

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

export interface ResolvedBinding {
  id:                string
  channelConfigId:   string
  agentId:           string
  externalChannelId: string | null
  externalGuildId:   string | null
  scopeLevel:        'channel' | 'guild'
  scopeId:           string
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

    const binding = await this.db.channelBinding.create({
      data: {
        channelConfigId:   dto.channelConfigId,
        agentId:           dto.agentId,
        externalChannelId: dto.externalChannelId ?? null,
        externalGuildId:   dto.externalGuildId   ?? null,
        scopeLevel:        'agent',
        scopeId:           dto.agentId,
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

  private _toResolved(binding: {
    id:                string
    channelConfigId:   string
    agentId:           string
    externalChannelId: string | null
    externalGuildId:   string | null
    [key: string]: unknown
  }): ResolvedBinding {
    const scopeLevel: 'channel' | 'guild' =
      binding.externalChannelId ? 'channel' : 'guild'
    const scopeId = binding.externalChannelId ?? binding.externalGuildId ?? ''
    return {
      id:                binding.id,
      channelConfigId:   binding.channelConfigId,
      agentId:           binding.agentId,
      externalChannelId: binding.externalChannelId,
      externalGuildId:   binding.externalGuildId,
      scopeLevel,
      scopeId,
    }
  }
}
