import {
  Controller, Get, Post, Param,
  Body, HttpCode, HttpStatus, HttpException,
} from '@nestjs/common'
import { Router } from 'express'
import { prisma } from '../core/db/prisma.service.js'
import { AgentResolverService } from '../gateway/agent-resolver.service.js'
import { GatewayService } from '../gateway/gateway.service.js'
import { ChannelLifecycleService } from './channel-lifecycle.service.js'
import { ProvisionChannelDto }     from './dto/provision-channel.dto.js'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
  WebhookRegistrationError,
} from './channel-lifecycle.errors.js'

@Controller('channels')
export class ChannelsController {
  constructor(private readonly lifecycle: ChannelLifecycleService) {}

  /** GET /channels — lista todos los canales */
  @Get()
  listAll() {
    return this.lifecycle.listAll()
  }

  /** GET /channels/:id/status — estado detallado */
  @Get(':id/status')
  async status(@Param('id') id: string) {
    return this.wrap(() => this.lifecycle.status(id))
  }

  /** POST /channels — provisionar nuevo canal */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async provision(@Body() dto: ProvisionChannelDto) {
    return this.wrap(() => this.lifecycle.provision(dto))
  }

  /** POST /channels/:id/start */
  @Post(':id/start')
  async start(@Param('id') id: string) {
    return this.wrap(() => this.lifecycle.start(id))
  }

  /** POST /channels/:id/stop */
  @Post(':id/stop')
  async stop(@Param('id') id: string) {
    return this.wrap(() => this.lifecycle.stop(id))
  }

  /** POST /channels/:id/restart */
  @Post(':id/restart')
  async restart(@Param('id') id: string) {
    return this.wrap(() => this.lifecycle.restart(id))
  }

  // Mapeo de errores de dominio → HTTP
  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof ChannelNotFoundError) {
        throw new HttpException(err.message, HttpStatus.NOT_FOUND)
      }
      if (err instanceof ChannelAlreadyInStateError) {
        throw new HttpException(err.message, HttpStatus.CONFLICT)
      }
      if (err instanceof InvalidTransitionError) {
        throw new HttpException(err.message, HttpStatus.UNPROCESSABLE_ENTITY)
      }
      if (err instanceof WebhookRegistrationError) {
        throw new HttpException(err.message, HttpStatus.BAD_GATEWAY)
      }
      throw err
    }
  }
}

export function registerChannelsRoutes(router: Router): void {
  const lifecycle = new ChannelLifecycleService(
    prisma as any,
    new GatewayService(),
    new AgentResolverService(),
  )

  void lifecycle.recoverStuckTransitions().catch((err) => {
    console.warn('[channels] recovery skipped:', err)
  })

  router.get('/channels', async (_req, res) => {
    try {
      res.json(await lifecycle.listAll())
    } catch (err) {
      sendError(res, err)
    }
  })

  router.get('/channels/:id/status', async (req, res) => {
    try {
      res.json(await lifecycle.status(req.params.id))
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/channels', async (req, res) => {
    try {
      res.status(HttpStatus.CREATED).json(await lifecycle.provision(req.body as ProvisionChannelDto))
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/channels/:id/start', async (req, res) => {
    try {
      res.json(await lifecycle.start(req.params.id))
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/channels/:id/stop', async (req, res) => {
    try {
      res.json(await lifecycle.stop(req.params.id))
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/channels/:id/restart', async (req, res) => {
    try {
      res.json(await lifecycle.restart(req.params.id))
    } catch (err) {
      sendError(res, err)
    }
  })
}

function sendError(res: import('express').Response, err: unknown): void {
  if (err instanceof ChannelNotFoundError) {
    res.status(HttpStatus.NOT_FOUND).json({ ok: false, error: err.message })
    return
  }
  if (err instanceof ChannelAlreadyInStateError) {
    res.status(HttpStatus.CONFLICT).json({ ok: false, error: err.message })
    return
  }
  if (err instanceof InvalidTransitionError) {
    res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ ok: false, error: err.message })
    return
  }
  if (err instanceof WebhookRegistrationError) {
    res.status(HttpStatus.BAD_GATEWAY).json({ ok: false, error: err.message })
    return
  }

  const message = err instanceof Error ? err.message : 'Internal error'
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ ok: false, error: message })
}
