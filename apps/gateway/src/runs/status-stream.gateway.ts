/**
 * [F3a-09] status-stream.gateway.ts
 *
 * WebSocket gateway that streams RunStep status transitions to connected clients.
 * Endpoint: ws://api/runs/:runId/status-stream  (D-23c)
 *
 * Protocol:
 *   Client → server:  { event: 'subscribeToRun',   data: { runId: string } }
 *   Client → server:  { event: 'unsubscribeFromRun', data: { runId: string } }
 *   Server → client:  { event: 'run_status_update', data: RunStatusPayload }
 *   Server → client:  { event: 'error',             data: { message: string } }
 *
 * Room strategy: one Socket.IO room per runId.
 * StatusChangeEvent (F2a-10) is emitted by HierarchyStatusService and caught
 * here via NestJS EventEmitter to push updates to the correct room.
 *
 * TODO(F3b): Add @UseGuards(WsAuthGuard) once jwtAuthMiddleware propagates
 * to the WebSocket handshake (phase F3b-security-layer). Also verify
 * run ownership in subscribeToRun: run.workspaceId !== socket.data.user.workspaceId
 * → emit 'error' { message: 'Unauthorized' } and return.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Logger }          from '@nestjs/common'
import { OnEvent }         from '@nestjs/event-emitter'
import { Server, Socket }  from 'socket.io'

// ── Payload types ────────────────────────────────────────────────────────────

/**
 * Shape of the StatusChangeEvent emitted by HierarchyStatusService (F2a-10).
 * Mirrors packages/run-engine/src/events/status-change.event.ts
 *
 * FIX [PR#144-C4]: Contract aligned with run-engine emission:
 *   - 'run.status.changed'  → 'step.status.changed'
 *   - status + startedAt + completedAt → currentStatus + timestamp
 *
 * FIX [PR#252 CR]: agentId and error typed as string | null to match run-engine
 * emission (packages/run-engine emits null, not undefined, for missing fields).
 */
export interface StatusChangeEvent {
  runId:         string
  stepId:        string
  agentId:       string | null
  nodeId:        string
  currentStatus: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waitingapproval'
  timestamp:     Date
  error:         string | null
}

/**
 * Payload pushed to WebSocket clients on every status change.
 * Uses string | undefined (not null) so JSON serialisation omits absent fields.
 */
export interface RunStatusPayload {
  runId:         string
  stepId:        string
  agentId?:      string
  nodeId:        string
  currentStatus: StatusChangeEvent['currentStatus']
  startedAt:     string  // ISO-8601 derived from timestamp
  completedAt:   string  // ISO-8601 derived from timestamp
  error?:        string
  ts:            string  // server timestamp ISO-8601
}

interface SubscribeDto {
  runId: string
}

// ── Gateway ──────────────────────────────────────────────────────────────────

@WebSocketGateway({
  namespace:   '/runs',
  cors:        { origin: '*' },   // tightened by F3b CORS middleware
  transports:  ['websocket'],
})
export class StatusStreamGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server

  private readonly logger = new Logger(StatusStreamGateway.name)

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  handleConnection(client: Socket): void {
    this.logger.log(`[connect]  socketId=${client.id} ip=${client.handshake.address}`)
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`[disconnect] socketId=${client.id}`)
    // Socket.IO automatically removes the socket from all rooms on disconnect.
  }

  // ── Client messages ───────────────────────────────────────────────────────

  /**
   * Client subscribes to a specific run's status stream.
   * Joins the room named after the runId so it only receives
   * events for that run.
   *
   * TODO(F3b): verify ownership before joining room:
   *   const run = await this.prisma.run.findUnique({ where: { id: dto.runId } })
   *   if (!run || run.workspaceId !== client.data.user.workspaceId) {
   *     client.emit('error', { message: 'Unauthorized' }); return;
   *   }
   */
  @SubscribeMessage('subscribeToRun')
  async handleSubscribe(
    @MessageBody()    dto:    SubscribeDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!dto?.runId || typeof dto.runId !== 'string') {
      client.emit('error', { message: 'subscribeToRun requires a valid runId string' })
      return
    }

    const room = runRoom(dto.runId)
    await client.join(room)
    this.logger.log(`[subscribe] socketId=${client.id} runId=${dto.runId}`)

    // Acknowledge subscription
    client.emit('subscribed', { runId: dto.runId })
  }

  /**
   * Client unsubscribes from a run's status stream.
   */
  @SubscribeMessage('unsubscribeFromRun')
  async handleUnsubscribe(
    @MessageBody()    dto:    SubscribeDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!dto?.runId || typeof dto.runId !== 'string') {
      client.emit('error', { message: 'unsubscribeFromRun requires a valid runId string' })
      return
    }

    const room = runRoom(dto.runId)
    await client.leave(room)
    this.logger.log(`[unsubscribe] socketId=${client.id} runId=${dto.runId}`)
  }

  // ── Internal event listener ───────────────────────────────────────────────

  /**
   * Triggered by HierarchyStatusService.emitStatusChange() (F2a-10)
   * on every RunStep transition.
   *
   * FIX [PR#144-C4]: Listens to 'step.status.changed' (was 'run.status.changed').
   * Reads event.currentStatus (was event.status) and event.timestamp (was
   * event.startedAt / event.completedAt).
   *
   * FIX [PR#252 CR]: event.agentId / event.error are string|null from the
   * run-engine. Use ?? undefined so the WS payload omits the field rather than
   * serialising null to JSON clients.
   *
   * Broadcasts to the room identified by the runId so only subscribed
   * clients receive the update.
   */
  @OnEvent('step.status.changed')
  handleStatusChanged(event: StatusChangeEvent): void {
    const isoTimestamp = event.timestamp?.toISOString() ?? new Date().toISOString()

    const payload: RunStatusPayload = {
      runId:         event.runId,
      stepId:        event.stepId,
      agentId:       event.agentId   ?? undefined,
      nodeId:        event.nodeId,
      currentStatus: event.currentStatus,
      startedAt:     isoTimestamp,
      completedAt:   isoTimestamp,
      error:         event.error     ?? undefined,
      ts:            new Date().toISOString(),
    }

    const room = runRoom(event.runId)
    this.server.to(room).emit('run_status_update', payload)

    this.logger.debug(
      `[broadcast] runId=${event.runId} stepId=${event.stepId} status=${event.currentStatus} room=${room}`,
    )
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic room name for a given runId */
function runRoom(runId: string): string {
  return `run:${runId}`
}
