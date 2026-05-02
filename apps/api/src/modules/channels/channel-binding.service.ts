/**
 * channel-binding.service.ts — F3a-32
 *
 * CRUD completo para el modelo Prisma ChannelBinding.
 * Implementa la resolución de bindings por externalChannelId / externalGuildId
 * con la misma lógica de prioridad que discord.commands.ts:
 *   channel-level (externalChannelId) > guild-level (externalGuildId)
 *
 * ChannelBinding conecta un ChannelConfig con un agente para un scope específico:
 *   - Discord: guildId (servidor completo) o channelId (canal específico)
 *   - Slack:   channelId de workspace
 *   - Otros:   externalChannelId genérico
 *
 * @example
 * const service = new ChannelBindingService();
 * // Resolver binding para un mensaje de Discord entrante:
 * const binding = await service.resolve(channelConfigId, { channelId, guildId });
 * if (!binding) throw new Error('No agent bound for this guild/channel');
 */

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { getPrisma } from '../../../../lib/prisma.js';

export interface CreateBindingDto {
  channelConfigId:    string;
  agentId:            string;
  /** ID externo del canal específico (Discord channelId, Slack channelId) */
  externalChannelId?: string | null;
  /** ID externo del servidor/workspace (Discord guildId) */
  externalGuildId?:   string | null;
  /** Metadatos opcionales del binding */
  meta?:              Record<string, unknown>;
}

export interface UpdateBindingDto {
  agentId?:           string;
  externalChannelId?: string | null;
  externalGuildId?:   string | null;
  meta?:              Record<string, unknown>;
}

export interface ResolveBindingQuery {
  channelId?: string | null;
  guildId?:   string | null;
}

export interface ResolvedBinding {
  id:                string;
  channelConfigId:   string;
  agentId:           string;
  externalChannelId: string | null;
  externalGuildId:   string | null;
  scopeLevel:        'channel' | 'guild';
  scopeId:           string;
}

@Injectable()
export class ChannelBindingService {
  private get db() { return getPrisma(); }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Crea un nuevo ChannelBinding.
   * Valida que no exista ya un binding con el mismo externalChannelId
   * para el mismo ChannelConfig antes de insertar.
   *
   * @param dto  Datos del binding a crear
   * @throws ConflictException si ya existe un binding para externalChannelId
   * @throws NotFoundException si el ChannelConfig no existe
   */
  async create(dto: CreateBindingDto): Promise<ResolvedBinding> {
    // Verificar que el ChannelConfig existe
    const config = await this.db.channelConfig.findUnique({
      where: { id: dto.channelConfigId },
    });
    if (!config) {
      throw new NotFoundException(`ChannelConfig not found: ${dto.channelConfigId}`);
    }

    // Unicidad: no puede haber dos bindings con el mismo externalChannelId en el mismo config
    if (dto.externalChannelId) {
      const existing = await this.db.channelBinding.findFirst({
        where: {
          channelConfigId:   dto.channelConfigId,
          externalChannelId: dto.externalChannelId,
        },
      });
      if (existing) {
        throw new ConflictException(
          `Binding already exists for externalChannelId '${dto.externalChannelId}' ` +
          `in channelConfig '${dto.channelConfigId}'.`,
        );
      }
    }

    const binding = await this.db.channelBinding.create({
      data: {
        channelConfigId:   dto.channelConfigId,
        agentId:           dto.agentId,
        externalChannelId: dto.externalChannelId ?? null,
        externalGuildId:   dto.externalGuildId   ?? null,
      },
    });

    return this._toResolved(binding);
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Lista todos los bindings de un ChannelConfig.
   *
   * @param channelConfigId  ID del ChannelConfig
   */
  async list(channelConfigId: string): Promise<ResolvedBinding[]> {
    const bindings = await this.db.channelBinding.findMany({
      where:   { channelConfigId },
      orderBy: { createdAt: 'asc' },
    });
    return bindings.map((b: any) => this._toResolved(b));
  }

  /**
   * Obtiene un binding por su ID.
   *
   * @param id  ID del ChannelBinding
   * @throws NotFoundException si no existe
   */
  async getById(id: string): Promise<ResolvedBinding> {
    const binding = await this.db.channelBinding.findUnique({ where: { id } });
    if (!binding) throw new NotFoundException(`ChannelBinding not found: ${id}`);
    return this._toResolved(binding);
  }

  /**
   * Busca el binding más específico para un canal externo.
   * Prioridad: channel-level (externalChannelId) > guild-level (externalGuildId).
   *
   * Esta es la función de resolución principal usada por los adapters Discord/Slack.
   *
   * @param channelConfigId  ID del ChannelConfig activo
   * @param query            channelId y/o guildId a resolver
   * @returns                El binding más específico, o null si no hay ninguno
   *
   * @example
   * const binding = await service.resolve(channelConfigId, {
   *   channelId: ctx.channelId,
   *   guildId:   ctx.guildId,
   * });
   */
  async resolve(
    channelConfigId: string,
    query: ResolveBindingQuery,
  ): Promise<ResolvedBinding | null> {
    // 1. Channel-level (más específico)
    if (query.channelId) {
      const channelBinding = await this.db.channelBinding.findFirst({
        where: {
          channelConfigId,
          externalChannelId: query.channelId,
        },
      });
      if (channelBinding) return this._toResolved(channelBinding);
    }

    // 2. Guild-level (fallback)
    if (query.guildId) {
      const guildBinding = await this.db.channelBinding.findFirst({
        where: {
          channelConfigId,
          externalGuildId: query.guildId,
        },
      });
      if (guildBinding) return this._toResolved(guildBinding);
    }

    return null;
  }

  /**
   * Busca bindings por externalChannelId dentro de un ChannelConfig.
   *
   * @param channelConfigId   ID del ChannelConfig
   * @param externalChannelId ID del canal externo
   */
  async findByExternalChannel(
    channelConfigId:   string,
    externalChannelId: string,
  ): Promise<ResolvedBinding | null> {
    const binding = await this.db.channelBinding.findFirst({
      where: { channelConfigId, externalChannelId },
    });
    return binding ? this._toResolved(binding) : null;
  }

  /**
   * Busca bindings por externalGuildId dentro de un ChannelConfig.
   *
   * @param channelConfigId  ID del ChannelConfig
   * @param externalGuildId  ID del servidor/workspace externo
   */
  async findByExternalGuild(
    channelConfigId: string,
    externalGuildId: string,
  ): Promise<ResolvedBinding | null> {
    const binding = await this.db.channelBinding.findFirst({
      where: { channelConfigId, externalGuildId },
    });
    return binding ? this._toResolved(binding) : null;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Actualiza un ChannelBinding existente.
   *
   * @param id  ID del binding
   * @param dto Campos a actualizar
   * @throws NotFoundException si el binding no existe
   */
  async update(id: string, dto: UpdateBindingDto): Promise<ResolvedBinding> {
    const existing = await this.db.channelBinding.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ChannelBinding not found: ${id}`);

    const updated = await this.db.channelBinding.update({
      where: { id },
      data: {
        ...(dto.agentId           !== undefined && { agentId:           dto.agentId           }),
        ...(dto.externalChannelId !== undefined && { externalChannelId: dto.externalChannelId }),
        ...(dto.externalGuildId   !== undefined && { externalGuildId:   dto.externalGuildId   }),
      },
    });
    return this._toResolved(updated);
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Elimina un ChannelBinding por su ID.
   *
   * @param id  ID del binding
   * @throws NotFoundException si el binding no existe
   */
  async remove(id: string): Promise<void> {
    const existing = await this.db.channelBinding.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ChannelBinding not found: ${id}`);
    await this.db.channelBinding.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Privado: mapeo a ResolvedBinding
  // ---------------------------------------------------------------------------

  private _toResolved(binding: {
    id:                string;
    channelConfigId:   string;
    agentId:           string;
    externalChannelId: string | null;
    externalGuildId:   string | null;
    [key: string]: unknown;
  }): ResolvedBinding {
    const scopeLevel: 'channel' | 'guild' =
      binding.externalChannelId ? 'channel' : 'guild';
    const scopeId =
      binding.externalChannelId ?? binding.externalGuildId ?? '';

    return {
      id:                binding.id,
      channelConfigId:   binding.channelConfigId,
      agentId:           binding.agentId,
      externalChannelId: binding.externalChannelId,
      externalGuildId:   binding.externalGuildId,
      scopeLevel,
      scopeId,
    };
  }
}
