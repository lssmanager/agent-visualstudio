# Channels Documentation

## Supported Channels

| Channel | Library | Status |
|---------|---------|--------|
| WhatsApp | Baileys | Planned (F8) |
| Telegram | grammY | Planned (F8) |
| Discord | Discord.js Gateway API | Planned (F8) |
| Microsoft Teams | Bot Framework SDK | Planned (F8) |
| WebChat | Custom WebSocket | Planned (F8) |

## Architecture

All channels connect through the **Channel Gateway** service which provides:
- Unified message ingestion
- Channel-to-agent routing
- Message normalization (channel-specific formats → internal format)
- Health monitoring and reconnection
- Outbound message queuing

## Channel Binding

Channels are bound at any level of the hierarchy. An Agency may bind WhatsApp for all its departments, or a specific Workspace may bind its own Telegram bot.

## Message Lifecycle

```
Inbound message (any channel)
  → Channel adapter normalizes to InternalMessage
  → Gateway routes to bound agent/workspace
  → Creates Run in runtime
  → Agent processes
  → Response routed back through channel adapter
  → Outbound message sent
```
