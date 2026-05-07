/**
 * @module gateway (API proxy)
 *
 * Este módulo es un CLIENTE HTTP del gateway runtime externo (apps/gateway/).
 * NO implementa lógica de sesiones, routing ni despacho de mensajes.
 *
 * Exports públicos:
 *   - GatewayModule              NestJS module — importar en AppModule o en el módulo consumidor
 *   - GatewayService             Proxy REST → studioConfig.gatewayBaseUrl
 *   - AgentResolverService       ChannelBinding → agentId con TTL cache de 60 s
 *   - GatewayHealthService       Health check del proceso gateway externo
 *   - GatewayDiagnosticsService  Diagnósticos del proceso gateway externo
 *
 * Runtime del gateway (NO está en este módulo):
 *   → apps/gateway/src/
 */

export { GatewayModule }              from './gateway.module'
export { GatewayService }             from './gateway.service'
export { AgentResolverService }       from './agent-resolver.service'
export { GatewayHealthService }       from './gateway-health.service'
export { GatewayDiagnosticsService }  from './gateway-diagnostics.service'
