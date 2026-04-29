import { Router } from 'express';

import { ChannelsService } from './channels.service';

export function registerChannelsRoutes(router: Router) {
  const service = new ChannelsService();

  /**
   * GET /channels
   * Lista todos los canales activos con conteo de sesiones.
   */
  router.get('/channels', async (_req, res) => {
    try {
      res.json(await service.listChannels());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * GET /channels/:channel
   * Detalle de un canal por nombre (e.g. "whatsapp", "web", "api").
   */
  router.get('/channels/:channel', async (req, res) => {
    try {
      const result = await service.getChannel(req.params.channel);
      if (!result.ok) return res.status(404).json(result);
      return res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * GET /channels/:channel/sessions
   * Lista todas las sesiones dentro de un canal.
   */
  router.get('/channels/:channel/sessions', async (req, res) => {
    try {
      res.json(await service.getChannelSessions(req.params.channel));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * POST /channels/:channel/disconnect
   * Desconecta todas las sesiones activas de un canal.
   */
  router.post('/channels/:channel/disconnect', async (req, res) => {
    try {
      res.json(await service.disconnectChannel(req.params.channel));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
}
