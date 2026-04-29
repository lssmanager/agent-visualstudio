/**
 * routes/slack.ts — Endpoints para el canal Slack
 *
 * Monta en:
 *   POST /gateway/slack/:channelId        — Slack Events API (HTTP mode)
 *
 * Flujo de Slack Events API:
 *   1. Slack envía un POST con { type: 'url_verification', challenge: '...' }
 *      al registrar el endpoint — respondemos { challenge } inmediatamente.
 *   2. Para eventos reales, validamos la firma HMAC-SHA256 y hacemos dispatch.
 *   3. Respondemos 200 inmediatamente (Slack exige < 3s).
 *
 * Verificación de firma:
 *   Requiere el raw body como string para calcular el HMAC.
 *   Usamos express.raw() antes del parser JSON en este router.
 *
 * Secrets en ChannelConfig.secretsEncrypted:
 *   { botToken, signingSecret, appToken? }
 *
 * Nota: Socket Mode no necesita este router — la conexión WebSocket
 * la inicia SlackAdapter.setup() en modo socket.
 */

import { Router, type Request, type Response } from 'express';
import express from 'express';
import { SlackAdapter } from '../channels/slack.adapter';
import type { GatewayService } from '../gateway.service';

type SlackChallenge = {
  type: string;
  challenge?: string;
};

type SlackEventPayload = {
  type: string;
  event?: { type: string; bot_id?: string };
};

export function slackRouter(gatewayService: GatewayService): Router {
  const router = Router();

  /**
   * POST /gateway/slack/:channelId
   *
   * Necesitamos el raw body para verificar la firma.
   * Usamos express.raw() localizado en este endpoint.
   */
  router.post(
    '/:channelId',
    express.raw({ type: 'application/json', limit: '2mb' }),
    async (req: Request, res: Response): Promise<void> => {
      const { channelId } = req.params;
      const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : '';

      let parsed: SlackChallenge & SlackEventPayload;
      try {
        parsed = JSON.parse(rawBody || '{}') as SlackChallenge & SlackEventPayload;
      } catch {
        res.status(400).json({ ok: false, error: 'Invalid JSON' });
        return;
      }

      // --- 1. url_verification challenge (Slack la envía al registrar el endpoint) ---
      if (parsed.type === 'url_verification' && parsed.challenge) {
        res.status(200).json({ challenge: parsed.challenge });
        return;
      }

      // --- 2. Verificar firma HMAC-SHA256 ---
      const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
      const signature = req.headers['x-slack-signature'] as string | undefined;

      if (!timestamp || !signature) {
        res.status(401).json({ ok: false, error: 'Missing Slack signature headers' });
        return;
      }

      // Obtener el signingSecret del canal (desde la config cacheada)
      // Lo verificamos ANTES de hacer dispatch para no procesar requests falsos
      try {
        // Acceso a loadChannelConfig es privado, así que resolvemos la config
        // via el mecanismo público: activateChannel carga la config al cache,
        // pero para la firma necesitamos el secret antes del dispatch.
        // Solución: exponemos un helper dedicado en GatewayService (ver nota abajo).
        // Por ahora, si SLACK_SIGNING_SECRET está en env lo usamos como fallback global.
        const signingSecret =
          process.env.SLACK_SIGNING_SECRET ??
          // En producción usarás gatewayService.getChannelSecret(channelId, 'signingSecret')
          // una vez que ese método sea expuesto en GatewayService.
          '';

        if (signingSecret) {
          const valid = await SlackAdapter.verifySignature(
            signingSecret,
            timestamp,
            signature,
            rawBody,
          );
          if (!valid) {
            res.status(401).json({ ok: false, error: 'Invalid Slack signature' });
            return;
          }
        } else {
          console.warn(
            `[slack] SLACK_SIGNING_SECRET not set for channel ${channelId} — skipping signature check`,
          );
        }
      } catch (err) {
        console.error('[slack] signature verification error:', err);
        res.status(500).json({ ok: false, error: 'Signature check failed' });
        return;
      }

      // --- 3. Ignorar eventos de bots (evitar loops) ---
      if (parsed.event?.bot_id) {
        res.status(200).json({ ok: true });
        return;
      }

      // --- 4. Responder 200 de inmediato (Slack exige < 3s) ---
      res.status(200).json({ ok: true });

      // --- 5. Dispatch asincrónico ---
      gatewayService
        .dispatch(channelId, parsed as Record<string, unknown>)
        .catch((err: unknown) => {
          console.error(`[slack] dispatch error for channel ${channelId}:`, err);
        });
    },
  );

  return router;
}
