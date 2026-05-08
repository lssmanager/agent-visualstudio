/**
 * routes/whatsapp-baileys.ts — [F3a-22/F3a-23]
 *
 * FIX #400: dynamic import corregido a '../channels/whatsapp-baileys.adapter'
 * (antes apuntaba a '../channels/whatsapp.adapter' que no exporta
 * WhatsAppBaileysAdapter).
 */

import { Router, type Request, type Response } from 'express'
import type { PrismaClient } from '@prisma/client'
import { whatsappSessionStore } from '../whatsapp-session.store'
import { WhatsAppDeprovisionService } from '../channels/whatsapp-deprovision.service'

interface BaileysAdapterConstructable {
  new (configId: string): {
    readonly channel: string
    state?: string
    onQr(handler: (qr: string) => void): void
    onConnected(handler: () => void): void
    onDisconnected(handler: () => void): void
    setup(config: Record<string, unknown>, secrets: Record<string, unknown>): Promise<void>
    logout(): Promise<void>
    dispose(): Promise<void>
  }
}

export function whatsappBaileysRouter(db: PrismaClient): Router {
  const router = Router({ mergeParams: true })
  const deprovisionSvc = new WhatsAppDeprovisionService(db, whatsappSessionStore)

  router.get('/:configId/qr', (req: Request, res: Response): void => {
    const { configId } = req.params
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write(': connected\n\n')
    whatsappSessionStore.addSseClient(configId, res)
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 25_000)
    res.on('close', () => clearInterval(heartbeat))
  })

  router.get('/:configId/status', (req: Request, res: Response): void => {
    const { configId } = req.params
    const entry = whatsappSessionStore.get(configId)
    if (!entry) {
      res.status(404).json({ ok: false, error: 'session not found', configId })
      return
    }
    res.json({ ok: true, configId, status: entry.status, hasQr: !!entry.qrBuffer })
  })

  router.post('/:configId/connect', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    const existing = whatsappSessionStore.get(configId)
    if (existing && existing.status !== 'disconnected' && existing.status !== 'error') {
      res.status(409).json({ ok: false, error: 'session already active', configId, status: existing.status })
      return
    }

    try {
      let AdapterClass: BaileysAdapterConstructable
      try {
        // FIX #400: import correcto — WhatsAppBaileysAdapter vive en su propio archivo
        const mod = await import('../channels/whatsapp-baileys.adapter')
        AdapterClass = (mod.WhatsAppBaileysAdapter ?? mod.default) as BaileysAdapterConstructable
      } catch {
        res.status(503).json({ ok: false, error: 'WhatsAppBaileysAdapter not available — install @whiskeysockets/baileys' })
        return
      }

      const adapter = new AdapterClass(configId)
      adapter.onQr((qr: string) => whatsappSessionStore.setQr(configId, qr))
      adapter.onConnected(() => whatsappSessionStore.setStatus(configId, 'connected'))
      adapter.onDisconnected(() => whatsappSessionStore.setStatus(configId, 'disconnected'))

      whatsappSessionStore.setAdapter(configId, adapter)
      whatsappSessionStore.setStatus(configId, 'connecting')

      const channelConfig = await db.channelConfig.findFirst({
        where: { id: configId },
        select: { id: true, credentials: true },
      })

      if (!channelConfig) {
        res.status(404).json({ ok: false, error: 'ChannelConfig not found', configId })
        return
      }

      const secrets = (channelConfig.credentials as Record<string, unknown>) ?? {}
      await adapter.setup({}, secrets)

      res.json({ ok: true, configId, status: 'connecting' })
    } catch (err) {
      console.error('[whatsapp-baileys:connect]', err)
      res.status(500).json({ ok: false, error: String(err) })
    }
  })

  router.post('/:configId/disconnect', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    const entry = whatsappSessionStore.get(configId)
    if (!entry?.adapter) {
      res.status(404).json({ ok: false, error: 'No active session', configId })
      return
    }
    try {
      await entry.adapter.logout()
      whatsappSessionStore.remove(configId)
      res.json({ ok: true, configId })
    } catch (err) {
      console.error('[whatsapp-baileys:disconnect]', err)
      res.status(500).json({ ok: false, error: String(err) })
    }
  })

  router.delete('/:configId', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    try {
      await deprovisionSvc.deprovision(configId)
      res.json({ ok: true, configId })
    } catch (err) {
      console.error('[whatsapp-baileys:deprovision]', err)
      res.status(500).json({ ok: false, error: String(err) })
    }
  })

  return router
}
