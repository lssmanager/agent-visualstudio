/**
 * channel-binding.controller.ts — F3a-32
 *
 * REST CRUD para ChannelBinding.
 * Montado bajo: /channels/:channelConfigId/bindings
 *
 * Endpoints:
 *   POST   /channels/:channelConfigId/bindings
 *     → Crear un nuevo binding
 *
 *   GET    /channels/:channelConfigId/bindings
 *     → Listar todos los bindings del canal
 *
 *   GET    /channels/:channelConfigId/bindings/resolve?channelId=&guildId=
 *     → Resolver el binding más específico para un par (channelId, guildId)
 *     → Útil para el frontend sin exponer la lógica de resolución
 *
 *   GET    /channels/:channelConfigId/bindings/:id
 *     → Obtener un binding por ID
 *
 *   PATCH  /channels/:channelConfigId/bindings/:id
 *     → Actualizar externalChannelId / externalGuildId / agentId
 *
 *   DELETE /channels/:channelConfigId/bindings/:id
 *     → Eliminar un binding
 *
 * Auth:
 *   El workspace ownership se verifica a través del channelConfig —
 *   el servicio lanza NotFoundException si el channelConfig no pertenece
 *   al workspace del usuario. Auth guard global de NestJS cubre el resto.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ChannelBindingService,
  type CreateBindingDto,
  type UpdateBindingDto,
} from './channel-binding.service';

@Controller('channels/:channelConfigId/bindings')
export class ChannelBindingController {
  constructor(private readonly bindingService: ChannelBindingService) {}

  // ---------------------------------------------------------------------------
  // POST /channels/:channelConfigId/bindings
  // ---------------------------------------------------------------------------

  /**
   * Crea un nuevo binding para el ChannelConfig.
   *
   * @body agentId            ID del agente a vincular (requerido)
   * @body externalChannelId  ID del canal específico (opcional)
   * @body externalGuildId    ID del servidor/workspace (opcional)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('channelConfigId', ParseUUIDPipe) channelConfigId: string,
    @Body() body: Omit<CreateBindingDto, 'channelConfigId'>,
  ) {
    return this.bindingService.create({ ...body, channelConfigId });
  }

  // ---------------------------------------------------------------------------
  // GET /channels/:channelConfigId/bindings
  // ---------------------------------------------------------------------------

  /**
   * Lista todos los bindings del ChannelConfig.
   */
  @Get()
  async list(
    @Param('channelConfigId', ParseUUIDPipe) channelConfigId: string,
  ) {
    return this.bindingService.list(channelConfigId);
  }

  // ---------------------------------------------------------------------------
  // GET /channels/:channelConfigId/bindings/resolve
  // ---------------------------------------------------------------------------

  /**
   * Resuelve el binding más específico para un par (channelId, guildId).
   * Retorna 404 si no hay binding.
   *
   * @query channelId  ID del canal externo (opcional)
   * @query guildId    ID del servidor externo (opcional)
   */
  @Get('resolve')
  async resolve(
    @Param('channelConfigId', ParseUUIDPipe) channelConfigId: string,
    @Query('channelId') channelId?: string,
    @Query('guildId')   guildId?:   string,
  ) {
    const binding = await this.bindingService.resolve(channelConfigId, {
      channelId: channelId ?? null,
      guildId:   guildId   ?? null,
    });
    if (!binding) {
      return { found: false, binding: null };
    }
    return { found: true, binding };
  }

  // ---------------------------------------------------------------------------
  // GET /channels/:channelConfigId/bindings/:id
  // ---------------------------------------------------------------------------

  /**
   * Obtiene un binding por su ID.
   */
  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bindingService.getById(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /channels/:channelConfigId/bindings/:id
  // ---------------------------------------------------------------------------

  /**
   * Actualiza un binding existente.
   *
   * @body agentId            Nuevo agentId (opcional)
   * @body externalChannelId  Nuevo externalChannelId (opcional, null para limpiar)
   * @body externalGuildId    Nuevo externalGuildId (opcional, null para limpiar)
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBindingDto,
  ) {
    return this.bindingService.update(id, body);
  }

  // ---------------------------------------------------------------------------
  // DELETE /channels/:channelConfigId/bindings/:id
  // ---------------------------------------------------------------------------

  /**
   * Elimina un binding por su ID.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.bindingService.remove(id);
  }
}
