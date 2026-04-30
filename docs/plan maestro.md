# AGENT VISUAL STUDIO — Add-on F3 Gateway Multicanal Prioritario

> Este archivo amplía la FASE 3a sin reescribir F0-F2 ni F4-F6.
> Mantiene F3a-01...F3a-10 y agrega F3a-11...F3a-40.

## Cambio de criterio

La F3 deja de ser solo `WebChat + Telegram` y pasa a ser `Gateway multicanal prioritario`:

1. WhatsApp
2. Telegram
3. Discord
4. Microsoft Teams
5. WebChat como canal base/UI propia

## Milestone nuevo / ampliado

**Milestone:** `F3a — Gateway multicanal prioritario`  
**Duración:** 2 semanas (2026-06-03 -> 2026-06-16)  
**Criterio de cierre:** WhatsApp, Telegram, Discord y Microsoft Teams operan como ChannelConfig/ChannelBinding con credenciales cifradas, estado en tiempo real, routing a AgentExecutor y tests E2E por canal.

## Roadmap por fases (orden topológico)

### FASE 1: Infrastructure Core (Sprint 1, Days 1-2)
Base para todos los canales - Sin dependencias internas F3a

- [ ] **[1] F3a-11** · Extender Prisma ChannelType/BotStatus para WhatsApp, Telegram, Discord y Microsoft Teams
  - Módulo: `prisma/schema.prisma`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`, `order:01`
  - Depende de: F3a-01,F3a-02
- [ ] **[2] F3a-12** · Implementar ChannelConfig credentials schema por canal con cifrado servidor
  - Módulo: `apps/api/src/modules/channels/dto/; packages/utils/src/crypto.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:security`, `channel:core`, `order:02`
  - Depende de: F3a-11,F0-10
- [ ] **[3] F3a-13** · Implementar ChannelBinding con prioridad scope a canal y resolver multi-canal
  - Módulo: `apps/gateway/src/agent-resolver.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`, `order:03`
  - Depende de: F3a-06,F3a-11

### FASE 2: Channel Lifecycle Services (Sprint 1, Days 3-4)
Core lifecycle y eventos en tiempo real

- [ ] **[4] F3a-14** · Crear ChannelLifecycleService provision/start/stop/restart/status
  - Módulo: `apps/api/src/modules/channels/channel-lifecycle.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`, `order:04`
  - Depende de: F3a-11,F3a-12,F3a-13
- [ ] **[5] F3a-15** · Crear ChannelEventEmitter para estado en tiempo real hacia UI
  - Módulo: `apps/api/src/modules/channels/channel-event-emitter.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:core`, `order:05`
  - Depende de: F3a-09,F3a-14

### FASE 3: Runtime & Gateway Endpoints (Sprint 1, Days 5-6)
Normalización de runtime y endpoints de administración

- [ ] **[6] F3a-17** · Normalizar ChannelRuntime.handleIncoming con replyFn, threadId y raw payload
  - Módulo: `apps/gateway/src/channel-runtime.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`, `order:06`
  - Depende de: F3a-07,F3a-08,F3a-14
- [ ] **[7] F3a-16** · Crear endpoints test/provision/deprovision para canales prioritarios
  - Módulo: `apps/api/src/modules/channels/channels.controller.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`, `order:07`
  - Depende de: F3a-14,F3a-15

### FASE 4: Telegram Channel (Sprint 1, Days 7 - Sprint 2, Day 1)
Implementación completa de Telegram

- [ ] **[8] F3a-18** · Endurecer TelegramAdapter con long-polling y webhook mode
  - Módulo: `apps/gateway/src/channels/telegram.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:telegram`, `order:08`
  - Depende de: F3a-04,F3a-14,F3a-17
- [ ] **[9] F3a-19** · Registrar comandos Telegram /start /ask /status y healthcheck token
  - Módulo: `apps/api/src/modules/channels/telegram-test.controller.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:telegram`, `order:09`
  - Depende de: F3a-18
- [ ] **[10] F3a-20** · Test E2E Telegram mensaje a GatewaySession a AgentExecutor a respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/telegram.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:telegram`, `order:10`
  - Depende de: F3a-18,F3a-19,F3a-17

### FASE 5: WhatsApp Channel (Sprint 2, Days 1-3)
Implementación completa de WhatsApp con Baileys

- [ ] **[11] F3a-21** · Implementar WhatsAppAdapter Baileys con QR pairing lazy-load
  - Módulo: `apps/gateway/src/channels/whatsapp.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:whatsapp`, `order:11`
  - Depende de: F3a-14,F3a-17
- [ ] **[12] F3a-22** · Persistir sesión WhatsApp por configId y exponer QR a UI
  - Módulo: `apps/gateway/src/channels/whatsapp-session.store.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:whatsapp`, `order:12`
  - Depende de: F3a-21,F3a-15
- [ ] **[13] F3a-23** · Implementar reconexión/backoff/logout/deprovision para WhatsApp
  - Módulo: `apps/gateway/src/channels/whatsapp.adapter.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:whatsapp`, `order:13`
  - Depende de: F3a-21,F3a-22
- [ ] **[14] F3a-24** · Normalizar mensajes WhatsApp texto/media y sendMessage de respuesta
  - Módulo: `apps/gateway/src/channels/whatsapp-message.mapper.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:whatsapp`, `order:14`
  - Depende de: F3a-21,F3a-17
- [ ] **[15] F3a-25** · Test E2E WhatsApp QR a GatewaySession a AgentExecutor a respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/whatsapp.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:whatsapp`, `order:15`
  - Depende de: F3a-21,F3a-22,F3a-23,F3a-24

### FASE 6: Discord Channel (Sprint 2, Days 3-4)
Implementación completa de Discord con slash commands y embeds

- [ ] **[16] F3a-26** · Implementar DiscordAdapter lifecycle con intents, guilds y mensajes
  - Módulo: `apps/gateway/src/channels/discord.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:discord`, `order:16`
  - Depende de: F3a-14,F3a-17
- [ ] **[17] F3a-27** · Implementar slash commands Discord /ask /status y binding por guild/canal
  - Módulo: `apps/gateway/src/channels/discord.commands.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:discord`, `order:17`
  - Depende de: F3a-26
- [ ] **[18] F3a-28** · Crear endpoints Discord test token, list guilds y list channels
  - Módulo: `apps/api/src/modules/channels/discord-test.controller.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:discord`, `order:18`
  - Depende de: F3a-26
- [ ] **[19] F3a-29** · Agregar respuestas ricas Discord Embeds y respuesta proactiva a canal
  - Módulo: `apps/gateway/src/channels/discord.reply.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:discord`, `order:19`
  - Depende de: F3a-26,F3a-27
- [ ] **[20] F3a-30** · Test E2E Discord mensaje/slash command a AgentExecutor a respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/discord.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:discord`, `order:20`
  - Depende de: F3a-26,F3a-27,F3a-28,F3a-29

### FASE 7: Microsoft Teams Channel (Sprint 2, Day 5)
Implementación completa de Teams con Bot Framework y Adaptive Cards

- [ ] **[21] F3a-31** · Definir Microsoft Teams mode: Incoming Webhook simple y Bot Framework completo
  - Módulo: `apps/gateway/src/channels/teams/teams-mode.strategy.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:teams`, `order:21`
  - Depende de: F3a-14,F3a-17
- [ ] **[22] F3a-32** · Implementar Teams Bot Framework adapter y endpoint /teams/messages
  - Módulo: `apps/gateway/src/channels/teams/teams-bot.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:teams`, `order:22`
  - Depende de: F3a-31
- [ ] **[23] F3a-33** · Implementar Teams Incoming Webhook sender para notificaciones simples
  - Módulo: `apps/gateway/src/channels/teams/teams-webhook.adapter.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:teams`, `order:23`
  - Depende de: F3a-31
- [ ] **[24] F3a-34** · Agregar Adaptive Cards para respuestas ricas en Microsoft Teams
  - Módulo: `apps/gateway/src/channels/teams/adaptive-card.builder.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:teams`, `order:24`
  - Depende de: F3a-32
- [ ] **[25] F3a-35** · Test E2E Teams Activity a GatewaySession a AgentExecutor a Adaptive Card
  - Módulo: `apps/gateway/src/_tests_/e2e/teams.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:teams`, `order:25`
  - Depende de: F3a-32,F3a-33,F3a-34

### FASE 8: Frontend & Security (Sprint 2, Days 5-6)
UI de configuración y auditoría

- [ ] **[26] F3a-36** · Crear Channel Settings UI para Telegram, WhatsApp, Discord y Teams
  - Módulo: `apps/web/src/modules/configuration/channels/ChannelSettings.tsx`
  - Labels: `phase:F3a`, `priority:blocker`, `area:frontend`, `channel:core`, `order:26`
  - Depende de: F3a-16,F6-13
- [ ] **[27] F3a-37** · Crear QR modal WhatsApp y ChannelStatusCard con SSE en tiempo real
  - Módulo: `apps/web/src/modules/configuration/channels/ChannelStatusCard.tsx`
  - Labels: `phase:F3a`, `priority:urgent`, `area:frontend`, `channel:whatsapp`, `order:27`
  - Depende de: F3a-15,F3a-22,F3a-36
- [ ] **[28] F3a-38** · Agregar audit log channel.provisioned/channel.message/channel.error
  - Módulo: `apps/api/src/modules/audit/audit.service.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:security`, `channel:core`, `order:28`
  - Depende de: F3b-07,F3a-14,F3a-17

### FASE 9: Integration Testing (Sprint 2, Day 7)
Test E2E multicanal

- [ ] **[29] F3a-39** · Crear matriz E2E multicanal WhatsApp Telegram Discord Teams
  - Módulo: `apps/gateway/src/_tests_/e2e/multichannel.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:core`, `order:29`
  - Depende de: F3a-20,F3a-25,F3a-30,F3a-35

### FASE 10: Documentation (Sprint 2, Day 7)
Documentación final

- [ ] **[30] F3a-40** · Documentar runbook de provisionamiento y troubleshooting por canal
  - Módulo: `docs/channels/runbook.md`
  - Labels: `phase:F3a`, `priority:required`, `area:docs`, `channel:core`, `order:30`
  - Depende de: F3a-39

## Nota de reorganización

- Las tareas antiguas de F5 sobre WhatsApp y Discord deben moverse a F3a o cerrarse como reemplazadas por este add-on.
- Slack puede quedar en F5 como canal adicional posterior.
- F3b sigue siendo capa de hardening de seguridad, pero F3a ya define el contrato mínimo de credenciales cifradas para poder provisionar canales.
