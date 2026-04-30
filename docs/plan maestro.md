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

## Tareas nuevas

- [ ] **F3a-11** · Extender Prisma ChannelType/BotStatus para WhatsApp, Telegram, Discord y Microsoft Teams
  - Módulo: `prisma/schema.prisma`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`
  - Depende de: F3a-01,F3a-02
- [ ] **F3a-12** · Implementar ChannelConfig credentials schema por canal con cifrado servidor
  - Módulo: `apps/api/src/modules/channels/dto/; packages/utils/src/crypto.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:security`, `channel:core`
  - Depende de: F3a-11,F0-10
- [ ] **F3a-13** · Implementar ChannelBinding con prioridad scope a canal y resolver multi-canal
  - Módulo: `apps/gateway/src/agent-resolver.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`
  - Depende de: F3a-06,F3a-11
- [ ] **F3a-14** · Crear ChannelLifecycleService provision/start/stop/restart/status
  - Módulo: `apps/api/src/modules/channels/channel-lifecycle.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`
  - Depende de: F3a-11,F3a-12,F3a-13
- [ ] **F3a-15** · Crear ChannelEventEmitter para estado en tiempo real hacia UI
  - Módulo: `apps/api/src/modules/channels/channel-event-emitter.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:core`
  - Depende de: F3a-09,F3a-14
- [ ] **F3a-16** · Crear endpoints test/provision/deprovision para canales prioritarios
  - Módulo: `apps/api/src/modules/channels/channels.controller.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`
  - Depende de: F3a-14,F3a-15
- [ ] **F3a-17** · Normalizar ChannelRuntime.handleIncoming con replyFn, threadId y raw payload
  - Módulo: `apps/gateway/src/channel-runtime.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:core`
  - Depende de: F3a-07,F3a-08,F3a-14
- [ ] **F3a-18** · Endurecer TelegramAdapter con long-polling y webhook mode
  - Módulo: `apps/gateway/src/channels/telegram.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:telegram`
  - Depende de: F3a-04,F3a-14,F3a-17
- [ ] **F3a-19** · Registrar comandos Telegram /start /ask /status y healthcheck token
  - Módulo: `apps/api/src/modules/channels/telegram-test.controller.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:telegram`
  - Depende de: F3a-18
- [ ] **F3a-20** · Test E2E Telegram mensaje a GatewaySession a AgentExecutor a respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/telegram.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:telegram`
  - Depende de: F3a-18,F3a-19,F3a-17
- [ ] **F3a-21** · Implementar WhatsAppAdapter Baileys con QR pairing lazy-load
  - Módulo: `apps/gateway/src/channels/whatsapp.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:whatsapp`
  - Depende de: F3a-14,F3a-17
- [ ] **F3a-22** · Persistir sesión WhatsApp por configId y exponer QR a UI
  - Módulo: `apps/gateway/src/channels/whatsapp-session.store.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:whatsapp`
  - Depende de: F3a-21,F3a-15
- [ ] **F3a-23** · Implementar reconexión/backoff/logout/deprovision para WhatsApp
  - Módulo: `apps/gateway/src/channels/whatsapp.adapter.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:whatsapp`
  - Depende de: F3a-21,F3a-22
- [ ] **F3a-24** · Normalizar mensajes WhatsApp texto/media y sendMessage de respuesta
  - Módulo: `apps/gateway/src/channels/whatsapp-message.mapper.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:whatsapp`
  - Depende de: F3a-21,F3a-17
- [ ] **F3a-25** · Test E2E WhatsApp QR a GatewaySession a AgentExecutor a respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/whatsapp.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:whatsapp`
  - Depende de: F3a-21,F3a-22,F3a-23,F3a-24
- [ ] **F3a-26** · Implementar DiscordAdapter lifecycle con intents, guilds y mensajes
  - Módulo: `apps/gateway/src/channels/discord.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:discord`
  - Depende de: F3a-14,F3a-17
- [ ] **F3a-27** · Implementar slash commands Discord /ask /status y binding por guild/canal
  - Módulo: `apps/gateway/src/channels/discord.commands.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:discord`
  - Depende de: F3a-26
- [ ] **F3a-28** · Crear endpoints Discord test token, list guilds y list channels
  - Módulo: `apps/api/src/modules/channels/discord-test.controller.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:discord`
  - Depende de: F3a-26
- [ ] **F3a-29** · Agregar respuestas ricas Discord Embeds y respuesta proactiva a canal
  - Módulo: `apps/gateway/src/channels/discord.reply.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:discord`
  - Depende de: F3a-26,F3a-27
- [ ] **F3a-30** · Test E2E Discord mensaje/slash command a AgentExecutor a respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/discord.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:discord`
  - Depende de: F3a-26,F3a-27,F3a-28,F3a-29
- [ ] **F3a-31** · Definir Microsoft Teams mode: Incoming Webhook simple y Bot Framework completo
  - Módulo: `apps/gateway/src/channels/teams/teams-mode.strategy.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:teams`
  - Depende de: F3a-14,F3a-17
- [ ] **F3a-32** · Implementar Teams Bot Framework adapter y endpoint /teams/messages
  - Módulo: `apps/gateway/src/channels/teams/teams-bot.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`, `channel:teams`
  - Depende de: F3a-31
- [ ] **F3a-33** · Implementar Teams Incoming Webhook sender para notificaciones simples
  - Módulo: `apps/gateway/src/channels/teams/teams-webhook.adapter.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:teams`
  - Depende de: F3a-31
- [ ] **F3a-34** · Agregar Adaptive Cards para respuestas ricas en Microsoft Teams
  - Módulo: `apps/gateway/src/channels/teams/adaptive-card.builder.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`, `channel:teams`
  - Depende de: F3a-32
- [ ] **F3a-35** · Test E2E Teams Activity a GatewaySession a AgentExecutor a Adaptive Card
  - Módulo: `apps/gateway/src/_tests_/e2e/teams.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:teams`
  - Depende de: F3a-32,F3a-33,F3a-34
- [ ] **F3a-36** · Crear Channel Settings UI para Telegram, WhatsApp, Discord y Teams
  - Módulo: `apps/web/src/modules/configuration/channels/ChannelSettings.tsx`
  - Labels: `phase:F3a`, `priority:blocker`, `area:frontend`, `channel:core`
  - Depende de: F3a-16,F6-13
- [ ] **F3a-37** · Crear QR modal WhatsApp y ChannelStatusCard con SSE en tiempo real
  - Módulo: `apps/web/src/modules/configuration/channels/ChannelStatusCard.tsx`
  - Labels: `phase:F3a`, `priority:urgent`, `area:frontend`, `channel:whatsapp`
  - Depende de: F3a-15,F3a-22,F3a-36
- [ ] **F3a-38** · Agregar audit log channel.provisioned/channel.message/channel.error
  - Módulo: `apps/api/src/modules/audit/audit.service.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:security`, `channel:core`
  - Depende de: F3b-07,F3a-14,F3a-17
- [ ] **F3a-39** · Crear matriz E2E multicanal WhatsApp Telegram Discord Teams
  - Módulo: `apps/gateway/src/_tests_/e2e/multichannel.e2e-spec.ts`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`, `channel:core`
  - Depende de: F3a-20,F3a-25,F3a-30,F3a-35
- [ ] **F3a-40** · Documentar runbook de provisionamiento y troubleshooting por canal
  - Módulo: `docs/channels/runbook.md`
  - Labels: `phase:F3a`, `priority:required`, `area:docs`, `channel:core`
  - Depende de: F3a-39

## Nota de reorganización

- Las tareas antiguas de F5 sobre WhatsApp y Discord deben moverse a F3a o cerrarse como reemplazadas por este add-on.
- Slack puede quedar en F5 como canal adicional posterior.
- F3b sigue siendo capa de hardening de seguridad, pero F3a ya define el contrato mínimo de credenciales cifradas para poder provisionar canales.
