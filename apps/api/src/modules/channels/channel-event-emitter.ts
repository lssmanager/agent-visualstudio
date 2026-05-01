import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common'
import { EventEmitter }                        from 'node:events'
import type { Response }                       from 'express'
import type { ChannelEvent, ChannelEventType } from './channel-event.types.js'

interface SseClient {
  id:          string
  res:         Response
  channelId?:  string
  connectedAt: Date
}

const HEARTBEAT_INTERVAL_MS = 15_000
const MAX_SSE_CLIENTS = 200

@Injectable()
export class ChannelEventEmitter implements OnModuleDestroy {
  private readonly logger  = new Logger(ChannelEventEmitter.name)
  private readonly emitter = new EventEmitter()
  private readonly sseClients = new Map<string, SseClient>()
  private heartbeatTimer?: ReturnType<typeof setInterval>

  constructor() {
    this.emitter.setMaxListeners(50)
    this.startHeartbeat()
  }

  emit<T>(event: ChannelEvent<T>): void {
    this.emitter.emit(event.event, event)
    this.emitter.emit('channel.*', event)
    this.broadcastToSse(event)
    this.logger.debug(`[emit] ${event.event} channelId="${event.channelId}"`)
  }

  on<T>(
    eventType: ChannelEventType | 'channel.*',
    listener:  (event: ChannelEvent<T>) => void,
  ): () => void {
    this.emitter.on(eventType, listener as (...args: unknown[]) => void)
    return () => this.emitter.off(eventType, listener as (...args: unknown[]) => void)
  }

  once<T>(
    eventType: ChannelEventType,
    listener:  (event: ChannelEvent<T>) => void,
  ): () => void {
    this.emitter.once(eventType, listener as (...args: unknown[]) => void)
    return () => this.emitter.off(eventType, listener as (...args: unknown[]) => void)
  }

  registerSseClient(res: Response, channelId?: string): () => void {
    if (this.sseClients.size >= MAX_SSE_CLIENTS) {
      this.logger.warn(
        `[SSE] Max clients (${MAX_SSE_CLIENTS}) reached — rejecting new connection`,
      )
      res.write('event: error\ndata: {"message":"Too many SSE clients"}\n\n')
      res.end()
      return () => undefined
    }

    const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const client: SseClient = { id: clientId, res, channelId, connectedAt: new Date() }
    this.sseClients.set(clientId, client)

    res.write(`: connected clientId=${clientId}\n\n`)

    this.logger.log(
      `[SSE] Client connected id=${clientId}` +
      (channelId ? ` channelId=${channelId}` : ' (all channels)'),
    )

    const cleanup = () => {
      this.sseClients.delete(clientId)
      this.logger.log(`[SSE] Client disconnected id=${clientId}`)
    }

    return cleanup
  }

  getSseStats(): { totalClients: number; byChannel: Record<string, number> } {
    const byChannel: Record<string, number> = {}
    for (const client of this.sseClients.values()) {
      const key = client.channelId ?? '__all__'
      byChannel[key] = (byChannel[key] ?? 0) + 1
    }
    return { totalClients: this.sseClients.size, byChannel }
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    for (const client of this.sseClients.values()) {
      try { client.res.end() } catch { }
    }
    this.sseClients.clear()
    this.emitter.removeAllListeners()
    this.logger.log('[destroy] ChannelEventEmitter shut down')
  }

  private broadcastToSse<T>(event: ChannelEvent<T>): void {
    const data = JSON.stringify(event)
    const deadClients: string[] = []

    for (const [clientId, client] of this.sseClients.entries()) {
      if (client.channelId && client.channelId !== event.channelId) {
        continue
      }

      try {
        client.res.write(`event: ${event.event}\ndata: ${data}\n\n`)
      } catch {
        deadClients.push(clientId)
      }
    }

    for (const id of deadClients) {
      this.sseClients.delete(id)
      this.logger.warn(`[SSE] Dead client removed id=${id}`)
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const deadClients: string[] = []
      for (const [clientId, client] of this.sseClients.entries()) {
        try {
          client.res.write(`: heartbeat\n\n`)
        } catch {
          deadClients.push(clientId)
        }
      }
      for (const id of deadClients) {
        this.sseClients.delete(id)
      }
    }, HEARTBEAT_INTERVAL_MS)

    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref()
  }
}
