/**
 * routes/webhook.ts — Endpoint para canal Webhook genérico
 *
 * Monta en: POST /gateway/webhook/:channelId
 *
 * A diferencia de Telegram/Slack, el webhook genérico es SINCRÓNICO:
 * el caller (ej. n8n) espera la respuesta del agente en el mismo POST.
 * El handler espera el dispatch() completo y retorna el reply en el body.
 *
 * Payload esperado:
 *   Content-Type: application/json
 *   {
 *     userId: string,          // ID único del usuario/origen
 *     text?: string,           // Mensaje de texto
 *     data?: Record<...>,      // Datos arbitrarios (si no hay text)
 *     source?: string          // Identificador del sistema ("n8n", etc.)
 *   }
 *
 * Autenticación opcional:
 *   Authorization: Bearer <webhookSecret>
 *   o X-Webhook-Secret: <webhookSecret>
 *
 * Respuesta:
 *   { ok: true, reply: "<respuesta del agente>", sessionId: "<id>" }
 *   o
 *   { ok: false, error: "..." }
 *
 * Timeout:
 *   Los agentes pueden tardar. Configurar el timeout del caller a >= 60s.
 *   El gateway no tiene timeout interno en este endpoint.
 *
 * Modo push (alternativo):
 *   Si ChannelConfig.config.replyWebhookUrl está configurado, el adapter
 *   también envía un POST a esa URL con la respuesta, además de retornarla aquí.
 */

import { Router, type Request, type Response } from 'express';
import { WebhookAdapter } from '../channels/webhook.adapter';
import type { GatewayService } from '../gateway.service';

type WebhookPayload = {
  userId?: string;
  text?: string;
  data?: Record<string, unknown>;
  source?: string;
};

export function webhookRouter(gatewayService: GatewayService): Router {
  const router = Router();

  /**
   * POST /gateway/webhook/:channelId
   *
   * Sincrónico: espera el reply del agente antes de responder.
   */
  router.post('/:channelId', async (req: Request, res: Response): Promise<void> => {
    const { channelId } = req.params;
    const body = req.body as WebhookPayload;

    // --- 1. Validar payload mínimo ---
    if (!body?.userId) {
      res.status(400).json({
        ok: false,
        error: 'Missing required field: userId',
      });
      return;
    }

    // --- 2. Verificar secreto opcional ---
    // Nota: idealmente verificaríamos contra el secret del canal específico.
    // Por ahora usamos WEBHOOK_SECRET global como fallback, igual que Telegram.
    const globalSecret = process.env.WEBHOOK_SECRET;
    if (globalSecret) {
      const authHeader = req.headers.authorization;
      const xSecret = req.headers['x-webhook-secret'] as string | undefined;
      const valid = WebhookAdapter.verifySecret(
        { webhookSecret: globalSecret },
        authHeader,
        xSecret,
      );
      if (!valid) {
        res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
        return;
      }
    }

    // --- 3. Dispatch SINCRÓNICO — esperamos la respuesta ---
    try {
      // Para poder retornar el reply, necesitamos interceptar la respuesta del agente.
      // GatewayService.dispatch() persiste y envía via adapter.send().
      // El WebhookAdapter.send() hace push si hay replyWebhookUrl, y además
      // almacena la última respuesta en el session (via SessionManager).
      // Recuperamos el reply desde la sesión post-dispatch.

      await gatewayService.dispatch(channelId, body as Record<string, unknown>);

      // Buscar la última sesión del userId en este canal para obtener el reply
      const session = await gatewayService.sessions.findSession(
        channelId,
        body.userId,
      );

      // El último mensaje del historial es el reply del agente
      const history = session?.history ?? [];
      const lastAssistant = [...history]
        .reverse()
        .find((m: { role: string }) => m.role === 'assistant') as
        | { role: string; content: string }
        | undefined;

      res.status(200).json({
        ok: true,
        reply: lastAssistant?.content ?? '',
        sessionId: session?.sessionId ?? null,
      });
    } catch (err) {
      console.error(`[webhook] dispatch error for channel ${channelId}:`, err);
      res.status(500).json({
        ok: false,
        error: 'Agent execution failed',
      });
    }
  });

  /**
   * GET /gateway/webhook/:channelId/health
   * Verificación simple de que el canal está activo.
   */
  router.get('/:channelId/health', async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ ok: true, channel: 'webhook', ts: new Date().toISOString() });
  });

  return router;
}
