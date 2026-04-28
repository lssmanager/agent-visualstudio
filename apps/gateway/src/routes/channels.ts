/**
 * routes/channels.ts — API REST de gestión de ChannelConfig + ChannelBinding
 *
 * Montada en /api/channels — requiere JWT (aplicado en server.ts).
 *
 * Endpoints:
 *
 *   POST   /api/channels
 *     Crea un ChannelConfig y su ChannelBinding inicial.
 *     Encripta secrets con AES-256-GCM antes de persistir.
 *     Body: { type, name, agentId, config?, secrets?, scopeLevel?, scopeId? }
 *
 *   GET    /api/channels
 *     Lista ChannelConfigs. Query: ?agentId=&type=&isActive=true|false
 *
 *   GET    /api/channels/:id
 *     Detalle de un ChannelConfig. Secrets siempre redactados.
 *
 *   PATCH  /api/channels/:id
 *     Actualiza name, config, secrets (re-encripta si cambia) o isActive.
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
 *     Body: { agentId, scopeLevel?, scopeId?, isDefault? }
 *
 *   DELETE /api/channels/:channelId/bindings/:bindingId
 *     Elimina un binding específico.
 *
 * Encriptación de secrets:
 *   AES-256-GCM, llave: GATEWAY_ENCRYPTION_KEY (hex 64 chars = 32 bytes)
 *   Formato: [12 bytes IV][16 bytes authTag][N bytes ciphertext], hex-encoded.
 *   La misma rutina que usa GatewayService.decrypt().
 */

import { randomBytes, createCipheriv } from 'crypto';
import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { GatewayService } from '../gateway.service';

// ---------------------------------------------------------------------------
// Encrypt helper (mirrors GatewayService.decrypt)
// ---------------------------------------------------------------------------

function encryptSecrets(
  secrets: Record<string, unknown>,
  keyHex: string,
): string {
  const key  = Buffer.from(keyHex || '0'.repeat(64), 'hex');
  const iv   = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(secrets), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

function redactSecrets<T extends Record<string, unknown>>(
  obj: T,
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(obj).map((k) => [k, '***']),
  );
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function channelsApiRouter(
  db:             PrismaClient,
  gatewayService: GatewayService,
): Router {
  const router = Router();
  const keyHex = process.env.GATEWAY_ENCRYPTION_KEY ?? '';

  if (!keyHex) {
    console.warn(
      '[channels] GATEWAY_ENCRYPTION_KEY not set — secrets will be stored as empty object',
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/channels — crear ChannelConfig + ChannelBinding inicial
  // ──────────────────────────────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      type:        string;
      name:        string;
      agentId:     string;
      config?:     Record<string, unknown>;
      secrets?:    Record<string, unknown>;
      scopeLevel?: string;
      scopeId?:    string;
      isDefault?:  boolean;
    };

    if (!body.type || !body.name || !body.agentId) {
      res.status(400).json({ ok: false, error: 'type, name and agentId are required' });
      return;
    }

    const allowedTypes = ['webchat', 'telegram', 'whatsapp', 'slack', 'discord', 'webhook'];
    if (!allowedTypes.includes(body.type)) {
      res.status(400).json({
        ok:    false,
        error: `type must be one of: ${allowedTypes.join(', ')}`,
      });
      return;
    }

    try {
      // Verify agent exists
      const agent = await db.agent.findUnique({ where: { id: body.agentId } });
      if (!agent) {
        res.status(404).json({ ok: false, error: 'Agent not found' });
        return;
      }

      const secretsEncrypted = encryptSecrets(
        body.secrets ?? {},
        keyHex,
      );

      // Create ChannelConfig + ChannelBinding in a transaction
      const result = await db.$transaction(async (tx) => {
        const channel = await tx.channelConfig.create({
          data: {
            type:             body.type,
            name:             body.name,
            config:           body.config   ?? {},
            secretsEncrypted,
            isActive:         false,
          },
        });

        const binding = await tx.channelBinding.create({
          data: {
            channelConfigId: channel.id,
            agentId:         body.agentId,
            scopeLevel:      body.scopeLevel ?? 'agent',
            scopeId:         body.scopeId   ?? body.agentId,
            isDefault:       body.isDefault ?? true,
          },
        });

        return { channel, binding };
      });

      res.status(201).json({
        ok:      true,
        channel: sanitizeChannel(result.channel),
        binding: result.binding,
      });
    } catch (err) {
      console.error('[channels] create error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/channels — listar
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { agentId, type, isActive } = req.query as Record<string, string>;

      // Filter by agentId via bindings
      const agentFilter = agentId
        ? { bindings: { some: { agentId } } }
        : {};

      const channels = await db.channelConfig.findMany({
        where: {
          ...agentFilter,
          ...(type     ? { type }                    : {}),
          ...(isActive !== undefined
            ? { isActive: isActive === 'true' }
            : {}),
        },
        include: { bindings: { include: { agent: { select: { id: true, name: true, slug: true } } } } },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        ok:   true,
        data: channels.map(sanitizeChannel),
      });
    } catch (err) {
      console.error('[channels] list error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/channels/:id — detalle
  // ──────────────────────────────────────────────────────────────────────────
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

      res.json({ ok: true, data: sanitizeChannel(channel) });
    } catch (err) {
      console.error('[channels] get error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/channels/:id — actualizar
  // ──────────────────────────────────────────────────────────────────────────
  router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      name?:    string;
      config?:  Record<string, unknown>;
      secrets?: Record<string, unknown>;
    };

    try {
      const existing = await db.channelConfig.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found' });
        return;
      }

      const updateData: Record<string, unknown> = {};
      if (body.name)    updateData.name   = body.name;
      if (body.config)  updateData.config = body.config;
      if (body.secrets) {
        updateData.secretsEncrypted = encryptSecrets(body.secrets, keyHex);
      }

      const updated = await db.channelConfig.update({
        where: { id: req.params.id },
        data:  updateData,
      });

      res.json({ ok: true, data: sanitizeChannel(updated) });
    } catch (err) {
      console.error('[channels] update error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /api/channels/:id — eliminar
  // ──────────────────────────────────────────────────────────────────────────
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const existing = await db.channelConfig.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found' });
        return;
      }

      // Deactivate first (graceful shutdown for adapters like Telegram)
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

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/channels/:id/activate
  // ──────────────────────────────────────────────────────────────────────────
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

      // Call adapter setup (e.g., registers Telegram webhook)
      await gatewayService.activateChannel(req.params.id);

      // Mark as active in DB
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

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/channels/:id/deactivate
  // ──────────────────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/channels/:channelId/bindings — agregar binding adicional
  // ──────────────────────────────────────────────────────────────────────────
  router.post('/:channelId/bindings', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      agentId:     string;
      scopeLevel?: string;
      scopeId?:    string;
      isDefault?:  boolean;
    };

    if (!body.agentId) {
      res.status(400).json({ ok: false, error: 'agentId is required' });
      return;
    }

    try {
      // Verify channel + agent exist
      const [channel, agent] = await Promise.all([
        db.channelConfig.findUnique({ where: { id: req.params.channelId } }),
        db.agent.findUnique(        { where: { id: body.agentId } }),
      ]);

      if (!channel) { res.status(404).json({ ok: false, error: 'ChannelConfig not found' }); return; }
      if (!agent)   { res.status(404).json({ ok: false, error: 'Agent not found' });         return; }

      // If setting as default, unset other defaults for this channel
      if (body.isDefault) {
        await db.channelBinding.updateMany({
          where: { channelConfigId: req.params.channelId, isDefault: true },
          data:  { isDefault: false },
        });
      }

      const binding = await db.channelBinding.create({
        data: {
          channelConfigId: req.params.channelId,
          agentId:         body.agentId,
          scopeLevel:      body.scopeLevel ?? 'agent',
          scopeId:         body.scopeId   ?? body.agentId,
          isDefault:       body.isDefault ?? false,
        },
      });

      res.status(201).json({ ok: true, data: binding });
    } catch (err: unknown) {
      // Unique constraint: binding already exists
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

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /api/channels/:channelId/bindings/:bindingId
  // ──────────────────────────────────────────────────────────────────────────
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
// Sanitize: nunca exponer secretsEncrypted al cliente
// ---------------------------------------------------------------------------

function sanitizeChannel(channel: Record<string, unknown>): Record<string, unknown> {
  const { secretsEncrypted: _dropped, ...safe } = channel as {
    secretsEncrypted: unknown;
    [key: string]: unknown;
  };
  return {
    ...safe,
    // Indicate whether secrets are configured, without exposing them
    hasSecrets: Boolean(_dropped),
  };
}
