/**
 * routes/whatsapp-baileys.ts — [F3a-22/F3a-23]
 */

import { Router, type Request, type Response } from 'express'
import type { PrismaClient } from '@prisma/client'
import { whatsappSessionStore } from '../whatsapp-session.store.js'
import { WhatsAppDeprovisionService } from '../channels/whatsapp-deprovision.service.js'

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
        const mod = await import('../channels/whatsapp.adapter.js')
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

      const { config = {}, secrets = {} } = (req.body ?? {}) as {
        config?: Record<string, unknown>
        secrets?: Record<string, unknown>
      }

      adapter.setup(config, secrets).catch(() => {
        whatsappSessionStore.setStatus(configId, 'error')
      })

      res.json({ ok: true, configId, status: 'connecting' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ ok: false, error: msg })
    }
  })

  router.post('/:configId/logout', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    const entry = whatsappSessionStore.get(configId)
    if (!entry) {
      res.status(404).json({ ok: false, error: 'session_not_found' })
      return
    }
    try {
      const result = await deprovisionSvc.logout(configId)
      res.json({ ok: true, ...result })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? 'internal_error' })
    }
  })

  router.post('/:configId/disconnect', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    try {
      const result = await deprovisionSvc.logout(configId)
      res.json({ ok: true, ...result })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? 'internal_error' })
    }
  })

  router.post('/:configId/deprovision', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    if (req.body?.confirm !== true) {
      res.status(400).json({
        ok: false,
        error: 'confirmation_required',
        hint: 'Send { "confirm": true } in request body to confirm deprovision',
      })
      return
    }
    try {
      const result = await deprovisionSvc.deprovision(configId)
      res.json({ ok: true, ...result })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? 'internal_error' })
    }
  })

  return router
}
