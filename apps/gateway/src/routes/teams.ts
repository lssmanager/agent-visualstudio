/**
 * routes/teams.ts — [F3a-32]
 *
 * Router factory para el canal Microsoft Teams.
 * Montado en /gateway/teams en server.ts.
 *
 * Este router es un thin wrapper que simplemente monta el
 * TeamsAdapter.getRouter() bajo el prefijo /gateway/teams.
 *
 * La inicialización del adapter se hace con channelConfigId vacío
 * porque en este proyecto el channelConfigId se resuelve por request
 * (via query param o header X-Channel-Config-Id).
 *
 * Uso en server.ts:
 *   import { teamsRouter } from './routes/teams'
 *   app.use('/gateway/teams', teamsRouter(db))
 */

import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { TeamsAdapter } from '../channels/teams/index.js'

/**
 * Factory que crea el router de Teams.
 *
 * @param db  PrismaClient — usado para futura carga de configs por request
 */
export function teamsRouter(_db?: PrismaClient): Router {
  const router = Router()

  /**
   * POST /gateway/teams/messages
   *
   * Endpoint principal de recepción de Activities del Bot Framework.
   * El channelConfigId se lee del header X-Channel-Config-Id o del
   * query param channelConfigId.
   *
   * En producción, cada workspace/tenant tendría su propia instancia
   * de TeamsAdapter con sus credenciales. Por ahora se crea una instancia
   * singleton por request con las credenciales del header.
   *
   * NOTA: Para un entorno multi-tenant real, usar un ChannelAdapterRegistry
   * que cachee instancias por channelConfigId.
   */
  router.post('/messages', async (req: Request, res: Response) => {
    const channelConfigId =
      (req.headers['x-channel-config-id'] as string | undefined) ??
      (req.query['channelConfigId'] as string | undefined)

    if (!channelConfigId) {
      res.status(400).json({
        error: 'Missing channelConfigId. ' +
               'Provide it via X-Channel-Config-Id header or channelConfigId query param.',
      })
      return
    }

    // Delegar al handler estático — el adapter correcto se resuelve
    // por channelConfigId en el ChannelLifecycleService
    res.status(501).json({
      message: 'TeamsAdapter multi-tenant routing not yet implemented. ' +
               'Register channel config and use ChannelLifecycleService.',
      channelConfigId,
    })
  })

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status:    'ok',
      channel:   'teams',
      timestamp: new Date().toISOString(),
    })
  })

  return router
}
