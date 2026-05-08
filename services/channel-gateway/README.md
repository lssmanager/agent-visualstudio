# Channel Gateway Service

The Channel Gateway is a standalone service responsible for managing all inbound and outbound channel communications.

## Responsibilities

- Maintain persistent connections to all configured channels
- Normalize inbound messages to `InternalMessage` format
- Route inbound messages to the appropriate agent/workspace via the API
- Queue and deliver outbound messages per channel protocol
- Monitor channel health and trigger reconnection
- Emit observability events for all channel activity

## Supported Channels

| Channel | Library | Connection Type |
|---------|---------|----------------|
| WhatsApp | Baileys | WebSocket (long-lived) |
| Telegram | grammY | Long polling / Webhook |
| Discord | Discord.js | WebSocket Gateway |
| Teams | Bot Framework | Webhook |
| WebChat | Custom | WebSocket |

## Architecture

```
Channel Gateway
  ├── WhatsApp Adapter (Baileys)
  ├── Telegram Adapter (grammY)
  ├── Discord Adapter
  ├── Teams Adapter
  ├── WebChat Adapter
  ├── Message Normalizer
  ├── Routing Engine
  ├── Outbound Queue (Redis)
  └── Health Monitor
```

## Health States

- `CONNECTED` — active connection
- `RECONNECTING` — attempting reconnect
- `DEGRADED` — connected but experiencing errors
- `DISCONNECTED` — no connection
