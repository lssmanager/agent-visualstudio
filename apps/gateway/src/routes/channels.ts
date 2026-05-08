/**
 * routes/channels.ts — API REST de gestión de ChannelConfig + ChannelBinding
 *
 * Montada en /api/channels — requiere JWT (aplicado en server.ts).
 *
 * Endpoints:
 *
 *   POST   /api/channels
 *     Crea un ChannelConfig y su ChannelBinding inicial.
 *     Body: { channel, name, agentId, config?, credentials?, scopeLevel? }
 *
 *   GET    /api/channels
 *     Lista ChannelConfigs. Query: ?agentId=&channel=&isActive=true|false
 *
 *   GET    /api/channels/:id
 *     Detalle de un ChannelConfig. Credentials siempre redactadas.
 *
 *   PATCH  /api/channels/:id
 *     Actualiza name, config, credentials o isActive.
 *
 *   DELETE /api/channels/:id
 *     Borra ChannelConfig. Cascada elimina bindings + sessions.
 *
 *   POST   /api/channels/:id/activate
 *     Activa el canal: llama GatewayService.activateChannel() + isActive=true.
 *
 *   POST   /api/channels/:id/deactivate
 *     Desactiva el canal: llama GatewayService.deactivateChannel() + isActive=false.
 *
 *   POST   /api/channels/:channelId/bindings
 *     Crea un ChannelBinding adicional (canal → agente adicional).
 *     Body: { agentId, scopeLevel? }
 *
 *   DELETE /api/channels/:channelId/bindings/:bindingId
 *     Elimina un binding específico.
 *
 * FIX [#396]: secretsEncrypted → credentials (JsonValue)
 * FIX [#397]: scopeId e isDefault eliminados de ChannelBinding
 */

import { Router, type Request, type Response } from 'express';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { GatewayService } from '../gateway.service';

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function channelsApiRouter(
  db:             PrismaClient,
  gatewayService: GatewayService,
): Router {
  const router = Router();

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/channels — crear ChannelConfig + ChannelBinding inicial
  // ─────────────────────────────────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      channel:     string;
      name:        string;
      agentId:     string;
      config?:     Record<string, unknown>;
      credentials?: Record<string, unknown>;
      scopeLevel?: string;
    };

    // Aceptar tanto 'channel' (nombre actual del schema) como 'type' (legacy)
    const channelType = body.channel ?? (req.body as Record<string, unknown>).type as string | undefined;

    if (!channelType || !body.name || !body.agentId) {
      res.status(400).json({ ok: false, error: 'channel, name and agentId are required' });
      return;
    }

    const allowedTypes = ['webchat', 'telegram', 'whatsapp', 'slack', 'discord', 'webhook', 'teams'];
    if (!allowedTypes.includes(channelType)) {
      res.status(400).json({
        ok:    false,
        error: `channel must be one of: ${allowedTypes.join(', ')}`,
      });
      return;
    }

    try {
      const agent = await db.agent.findUnique({ where: { id: body.agentId } });
      if (!agent) {
        res.status(404).json({ ok: false, error: 'Agent not found' });
        return;
      }

      // FIX [#396]: guardar en credentials (JsonValue), no en secretsEncrypted
      const result = await db.$transaction(async (tx) => {
        const channel = await tx.channelConfig.create({
          data: {
            channel:     channelType,
            name:        body.name,
            config:      (body.config ?? {}) as Prisma.InputJsonValue,
            credentials: (body.credentials ?? {}) as Prisma.InputJsonValue,
            isActive:    false,
          },
        });

        // FIX [#397]: crear binding SIN scopeId ni isDefault
        const binding = await tx.channelBinding.create({
          data: {
            channelConfigId: channel.id,
            agentId:         body.agentId,
            scopeLevel:      body.scopeLevel ?? 'agent',
          },
        });

        return { channel, binding };
      });

      res.status(201).json({
        ok:      true,
        channel: sanitizeChannel(result.channel as Record<string, unknown>),
        binding: result.binding,
      });
    } catch (err) {
      console.error('[channels] create error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/channels — listar
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { agentId, channel, type, isActive } = req.query as Record<string, string>;
      // Acepta tanto ?channel= como ?type= (legacy)
      const channelFilter = channel ?? type;

      const agentFilter = agentId
        ? { bindings: { some: { agentId } } }
        : {};

      const channels = await db.channelConfig.findMany({
        where: {
          ...agentFilter,
          ...(channelFilter ? { channel: channelFilter }           : {}),
          ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
        },
        include: { bindings: { include: { agent: { select: { id: true, name: true, slug: true } } } } },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        ok:   true,
        data: channels.map((c) => sanitizeChannel(c as Record<string, unknown>)),
      });
    } catch (err) {
      console.error('[channels] list error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/channels/:id — detalle
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const channel = await db.channelConfig.findUnique({
        where:   { id: req.params.id },
        include: { bindings: { include: { agent: { select: { id: true, name: true, slug: true } } } } },
      });

      if (!channel) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found' });
        return;
      }

      res.json({ ok: true, data: sanitizeChannel(channel as Record<string, unknown>) });
    } catch (err) {
      console.error('[channels] get error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /api/channels/:id — actualizar
  // ─────────────────────────────────────────────────────────────────────────────
  router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      name?:        string;
      config?:      Record<string, unknown>;
      credentials?: Record<string, unknown>;
      isActive?:    boolean;
    };

    try {
      const existing = await db.channelConfig.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found' });
        return;
      }

      const updateData: Prisma.ChannelConfigUpdateInput = {};
      if (body.name    !== undefined) updateData.name        = body.name;
      if (body.config  !== undefined) updateData.config      = body.config  as Prisma.InputJsonValue;
      if (body.credentials !== undefined) updateData.credentials = body.credentials as Prisma.InputJsonValue;
      if (body.isActive !== undefined) updateData.isActive   = body.isActive;

      const updated = await db.channelConfig.update({
        where: { id: req.params.id },
        data:  updateData,
      });

      res.json({ ok: true, data: sanitizeChannel(updated as Record<string, unknown>) });
    } catch (err) {
      console.error('[channels] update error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /api/channels/:id — eliminar
  // ─────────────────────────────────────────────────────────────────────────────
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const existing = await db.channelConfig.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found' });
        return;
      }

      if (existing.isActive) {
        await gatewayService.deactivateChannel(req.params.id).catch(() => {});
      }

      await db.channelConfig.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[channels] delete error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/channels/:id/activate
  // ─────────────────────────────────────────────────────────────────────────────
  router.post('/:id/activate', async (req: Request, res: Response): Promise<void> => {
    try {
      const existing = await db.channelConfig.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found' });
        return;
      }

      if (existing.isActive) {
        res.json({ ok: true, message: 'Already active' });
        return;
      }

      await gatewayService.activateChannel(req.params.id);

      await db.channelConfig.update({
        where: { id: req.params.id },
        data:  { isActive: true },
      });

      res.json({ ok: true, message: `Channel ${req.params.id} activated` });
    } catch (err) {
      console.error('[channels] activate error:', err);
      res.status(500).json({
        ok:    false,
        error: err instanceof Error ? err.message : 'Internal error',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/channels/:id/deactivate
  // ─────────────────────────────────────────────────────────────────────────────
  router.post('/:id/deactivate', async (req: Request, res: Response): Promise<void> => {
    try {
      const existing = await db.channelConfig.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found' });
        return;
      }

      if (!existing.isActive) {
        res.json({ ok: true, message: 'Already inactive' });
        return;
      }

      await gatewayService.deactivateChannel(req.params.id);

      await db.channelConfig.update({
        where: { id: req.params.id },
        data:  { isActive: false },
      });

      res.json({ ok: true, message: `Channel ${req.params.id} deactivated` });
    } catch (err) {
      console.error('[channels] deactivate error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/channels/:channelId/bindings — agregar binding adicional
  // ─────────────────────────────────────────────────────────────────────────────
  router.post('/:channelId/bindings', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      agentId:     string;
      scopeLevel?: string;
    };

    if (!body.agentId) {
      res.status(400).json({ ok: false, error: 'agentId is required' });
      return;
    }

    try {
      const [channel, agent] = await Promise.all([
        db.channelConfig.findUnique({ where: { id: req.params.channelId } }),
        db.agent.findUnique(        { where: { id: body.agentId } }),
      ]);

      if (!channel) { res.status(404).json({ ok: false, error: 'ChannelConfig not found' }); return; }
      if (!agent)   { res.status(404).json({ ok: false, error: 'Agent not found' });         return; }

      // FIX [#397]: crear binding SIN scopeId ni isDefault
      const binding = await db.channelBinding.create({
        data: {
          channelConfigId: req.params.channelId,
          agentId:         body.agentId,
          scopeLevel:      body.scopeLevel ?? 'agent',
        },
      });

      res.status(201).json({ ok: true, data: binding });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes('Unique constraint')
      ) {
        res.status(409).json({ ok: false, error: 'Binding already exists for this agent' });
        return;
      }
      console.error('[channels] create binding error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /api/channels/:channelId/bindings/:bindingId
  // ─────────────────────────────────────────────────────────────────────────────
  router.delete(
    '/:channelId/bindings/:bindingId',
    async (req: Request, res: Response): Promise<void> => {
      try {
        const binding = await db.channelBinding.findUnique({
          where: { id: req.params.bindingId },
        });

        if (!binding || binding.channelConfigId !== req.params.channelId) {
          res.status(404).json({ ok: false, error: 'Binding not found' });
          return;
        }

        await db.channelBinding.delete({ where: { id: req.params.bindingId } });
        res.json({ ok: true });
      } catch (err) {
        console.error('[channels] delete binding error:', err);
        res.status(500).json({ ok: false, error: 'Internal error' });
      }
    },
  );

  return router;
}

// ---------------------------------------------------------------------------
// Sanitize: nunca exponer credentials al cliente
// ---------------------------------------------------------------------------

function sanitizeChannel(channel: Record<string, unknown>): Record<string, unknown> {
  // FIX [#396/#397]: eliminar credentials del payload de respuesta
  const { credentials: _cred, secretsEncrypted: _enc, ...safe } = channel as {
    credentials:      unknown;
    secretsEncrypted: unknown;
    [key: string]:    unknown;
  };
  return {
    ...safe,
    hasCredentials: Boolean(_cred),
  };
}
