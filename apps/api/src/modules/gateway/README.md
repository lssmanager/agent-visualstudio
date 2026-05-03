# Gateway Module — `apps/api/src/modules/gateway/`

> **Este módulo es un cliente HTTP del gateway externo, no el runtime del gateway.**

## Responsabilidad

Este módulo expone el gateway runtime como servicios inyectables dentro de la API NestJS.
**No implementa lógica de routing, sesiones ni despacho de mensajes.**

| Servicio | Rol |
|---|---|
| `GatewayService` | Proxy REST → `studioConfig.gatewayBaseUrl` para RPC, health, diagnostics, sessions, agents y acciones de canal (activate/deactivate) |
| `AgentResolverService` | Resuelve el agente que atiende un `ChannelConfig` dado, consultando `ChannelBinding` en BD con cache TTL de 60 s |
| `GatewayHealthService` | Comprobación de salud del proceso gateway externo |
| `GatewayDiagnosticsService` | Recolecta diagnósticos del gateway externo para el panel de administración |

## Lo que NO está aquí

| Componente | Dónde vive |
|---|---|
| `SessionManager` | `apps/gateway/src/` |
| `MessageDispatcher` | `apps/gateway/src/` |
| `ChannelRouter` | `apps/gateway/src/` |
| WebSocket status-stream | `apps/gateway/src/` |
| Adaptadores Telegram / Webchat | `apps/gateway/src/` |

## Split arquitectural

```text
apps/api/src/modules/gateway/   ← ESTE módulo — cliente/proxy dentro de la API
  GatewayService                  fetch a studioConfig.gatewayBaseUrl
  AgentResolverService            ChannelBinding → agentId (cache TTL 60 s)
  GatewayHealthService            health check del proceso gateway
  GatewayDiagnosticsService       diagnósticos del proceso gateway

apps/gateway/src/               ← Runtime del gateway (proceso separado)
  SessionManager                  ciclo de vida de sesiones en Prisma
  MessageDispatcher               orquestación: mensaje entrante → agente → respuesta
  ChannelRouter                   routing por tipo de canal (telegram, webchat, …)
  status-stream                   WebSocket push de estado en tiempo real
```

## Regla de oro

> Si buscas lógica de sesiones, routing o despacho → `apps/gateway/src/`
> Si buscas control del gateway desde la API → `apps/api/src/modules/gateway/`

## Uso desde otros módulos de la API

```typescript
// Importar GatewayModule en el módulo consumidor:
@Module({ imports: [GatewayModule] })
export class MiModule {}

// Inyectar los servicios:
constructor(
  private readonly gateway:     GatewayService,
  private readonly health:      GatewayHealthService,
  private readonly diagnostics: GatewayDiagnosticsService,
) {}

// Comprobar salud del proceso gateway:
const h = await this.health.check()

// Listar sesiones activas (RPC + fallback dashboard):
const sessions = await this.gateway.listSessions()

// Activar / desactivar un canal:
await this.gateway.activateChannel(channelConfigId)
await this.gateway.deactivateChannel(channelConfigId)

// Resolver qué agente atiende un canal:
const agentId = await this.agentResolver.resolve(channelConfigId)
```

## Variables de entorno relevantes

| Variable | Uso |
|---|---|
| `GATEWAY_BASE_URL` | URL base del proceso gateway runtime (leída por `studioConfig.gatewayBaseUrl`) |
