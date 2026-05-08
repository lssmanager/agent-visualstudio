# @agent-vs/channels

Channel adapter implementations for agent-visualstudio.

## Contents

- `adapters/whatsapp/` — Baileys-based WhatsApp adapter
- `adapters/telegram/` — grammY-based Telegram adapter
- `adapters/discord/` — Discord.js adapter
- `adapters/teams/` — Bot Framework adapter
- `adapters/webchat/` — WebSocket-based web chat adapter
- `gateway/` — Unified Channel Gateway
- `normalizer/` — Message format normalization
- `router/` — Channel-to-agent routing

## Interface

All adapters implement `IChannelAdapter`:

```typescript
interface IChannelAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: OutboundMessage): Promise<void>;
  getHealth(): ChannelHealth;
  on(event: 'message', handler: (msg: InternalMessage) => void): void;
}
```
