/**
 * routes/telegram.ts — Webhook handler para Telegram
 *
 * Monta en: POST /gateway/telegram/:channelId
 *
 * Seguridad:
 *   Telegram puede enviar el header X-Telegram-Bot-Api-Secret-Token
 *   si se configuró en setWebhook({ secret_token: '...' }).
 *   Si TELEGRAM_WEBHOOK_SECRET está en env, validamos el header.
 *   Si no está configurado, aceptamos cualquier request que llegue
 *   a la URL (la URL secreta actúa como primer factor de seguridad).
 *
 * El handler devuelve 200 inmediatamente (Telegram exige < 5s de respuesta)
 * y procesa el mensaje de forma asíncrona.
 */

import { Router, type Request, type Response } from 'express';
import type { GatewayService } from '../gateway.service';

export function telegramRouter(gatewayService: GatewayService): Router {
  const router = Router();

  router.post('/:channelId', async (req: Request, res: Response): Promise<void> => {
    const { channelId } = req.params;

    // --- Validate optional Telegram secret token ---
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret) {
      const provided = req.headers['x-telegram-bot-api-secret-token'];
      if (provided !== expectedSecret) {
        res.status(401).json({ ok: false, error: 'Invalid secret token' });
        return;
      }
    }

    // Respond 200 immediately — Telegram will retry if we timeout
    res.status(200).json({ ok: true });

    // Process async — errors are logged but don't affect the 200 already sent
    gatewayService
      .dispatch(channelId, req.body as Record<string, unknown>)
      .catch((err: unknown) => {
        console.error(`[telegram] dispatch error for channel ${channelId}:`, err);
      });
  });

  return router;
}
