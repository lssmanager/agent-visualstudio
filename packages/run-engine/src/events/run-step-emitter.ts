import { EventEmitter } from 'node:events'
import type { StatusChangeEvent } from './status-change.event.js'
import { STEP_STATUS_CHANGED }    from './status-change.event.js'

/**
 * EventEmitter tipado para transiciones de RunStep.
 *
 * Framework-agnostic: usa el EventEmitter nativo de Node.
 * Las apps NestJS lo envuelven como provider singleton.
 *
 * Uso en emisores (AgentExecutor, HierarchyOrchestrator):
 *   emitter.emitStepChanged(event)
 *
 * Uso en suscriptores (F3a-09 WebSocket stream):
 *   emitter.onStepChanged((event) => { ... })
 *   emitter.offStepChanged(handler)
 *
 * El evento raw también está accesible vía Node EventEmitter
 * para integraciones que lo requieran:
 *   emitter.on(STEP_STATUS_CHANGED, handler)
 */
export class RunStepEventEmitter extends EventEmitter {
  constructor() {
    super()
    // Aumentar el límite por defecto (10) para soportar múltiples
    // suscriptores concurrentes sin warnings en producción.
    // 50 es suficiente para la arquitectura actual.
    this.setMaxListeners(50)
  }

  /**
   * Emite un StatusChangeEvent.
   * Llamar DESPUÉS de que el write en BD haya sido confirmado.
   * Nunca llamar antes — el evento debe reflejar el estado real en BD.
   */
  emitStepChanged(event: StatusChangeEvent): void {
    this.emit(STEP_STATUS_CHANGED, event)
  }

  /**
   * Suscribe un handler a todas las transiciones de RunStep.
   * Para filtrar por runId o workspaceId, hacerlo dentro del handler.
   */
  onStepChanged(handler: (event: StatusChangeEvent) => void): void {
    this.on(STEP_STATUS_CHANGED, handler)
  }

  /**
   * Cancela la suscripción de un handler.
   */
  offStepChanged(handler: (event: StatusChangeEvent) => void): void {
    this.off(STEP_STATUS_CHANGED, handler)
  }

  /**
   * Suscribe un handler que se ejecuta solo una vez.
   * Útil en tests y en flujos de request/response único.
   */
  onceStepChanged(handler: (event: StatusChangeEvent) => void): void {
    this.once(STEP_STATUS_CHANGED, handler)
  }
}

/**
 * Singleton del emitter para uso dentro del paquete run-engine.
 *
 * IMPORTANTE para NestJS (apps/api, apps/gateway):
 *   NO importar este singleton directamente en módulos NestJS.
 *   En su lugar, crear un provider que envuelva RunStepEventEmitter:
 *
 *   @Module({
 *     providers: [
 *       { provide: RunStepEventEmitter, useValue: runStepEmitter },
 *     ],
 *     exports: [RunStepEventEmitter],
 *   })
 *   export class EventsModule {}
 *
 *   Esto garantiza que toda la app comparte la misma instancia
 *   y que NestJS puede inyectarla sin circular deps.
 */
export const runStepEmitter = new RunStepEventEmitter()
