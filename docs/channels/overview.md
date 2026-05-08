# Channels Overview

## Architecture

All channels are governed by the **Gateway service**. The gateway:
1. Receives inbound messages from any connected channel
2. Resolves the target agent via **channel bindings** (set in Agent Builder)
3. Creates a `Run` and passes the message as the originator context
4. Streams the agent's response back to the originating channel

## Channel Bindings

Each agent specifies which channels it listens and responds on. Bindings are set in Agent Builder and stored in the `AgentChannelBinding` table.

## Supported Channels

| Channel | Library | Auth | Features |
|---------|---------|------|----------|
| **WebChat** | WebSocket (native) | Embed token | Default for all agents, streaming, embeddable widget |
| **Telegram** | grammY | Bot token | Polling/webhook, DM + group, mention policies |
| **WhatsApp** | Baileys | QR pairing | Persistent session, reconnect, group support |
| **Microsoft Teams** | Bot Framework SDK | Azure OAuth | Adaptive Cards, channel + DM, tenant allowlist |
| **Discord** | Discord.js | Bot token | Gateway WS, intents, slash commands, role allowlist |

## WebChat (Default)

Every agent automatically gets a WebChat binding. Features:
- WebSocket server with session management
- Streaming token-by-token response
- Embeddable widget with a unique embed token
- CORS-configurable for cross-origin embedding

## Channel Health

Each channel shows a health badge in Settings:
- 🟢 Connected
- 🟡 Degraded (reconnecting)
- 🔴 Disconnected

Health monitor tracks reconnect attempts, error rates, and last message timestamp.
