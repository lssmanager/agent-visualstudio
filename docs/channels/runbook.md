# Runbook: Gateway Multicanal — Provisionamiento y Troubleshooting

> **Versión:** F3a — Gateway multicanal prioritario  
> **Actualizado:** 2026-05-02  
> **Rama de referencia:** `feat/phase-F3a-gateway-webchat-telegram`
>
> Este documento describe cómo aprovisionar cada canal desde cero y cómo
> diagnosticar los problemas más comunes en producción.  
> **Mantenlo actualizado cada vez que cambie un adapter.**

---

## Índice

1. [Arquitectura del gateway](#1-arquitectura-del-gateway)
2. [Variables de entorno requeridas](#2-variables-de-entorno-requeridas)
3. [Provisionamiento: WhatsApp](#3-provisionamiento-whatsapp)
4. [Provisionamiento: Telegram](#4-provisionamiento-telegram)
5. [Provisionamiento: Discord](#5-provisionamiento-discord)
6. [Provisionamiento: Microsoft Teams](#6-provisionamiento-microsoft-teams)
7. [Modelo de datos: ChannelConfig y ChannelBinding](#7-modelo-de-datos-channelconfig-y-channelbinding)
8. [Troubleshooting por canal](#8-troubleshooting-por-canal)
9. [Checklist de verificación post-deploy](#9-checklist-de-verificación-post-deploy)
10. [Runbook de incidencias comunes](#10-runbook-de-incidencias-comunes)

---

## 1. Arquitectura del gateway

```
Usuario
  │
  ▼
[Canal externo]          WhatsApp / Telegram / Discord / Teams
  │  POST webhook
  ▼
[Gateway HTTP]           apps/gateway  →  /gateway/:canal/webhook
  │
  ├─ Auth middleware     Verifica firma HMAC / token / JWT según el canal
  │
  ├─ Adapter            Normaliza payload → IncomingMessage
  │
  ├─ SessionManager     Upsert GatewaySession en Prisma
  │
  ├─ ChannelRuntime     Resuelve ChannelBinding → agentId
  │
  └─ AgentExecutor      Llama al agente LLM y obtiene respuesta
       │
       └─ Adapter.send()   Envía respuesta al canal externo
```

**Principio:** cada canal tiene su propio adapter que implementa la interfaz
`ChannelAdapter` definida en `channel-adapter.interface.ts`. El gateway no
conoce los detalles de cada API externa; el adapter los abstrae.

**Arquitectura de credenciales:** los secrets de cada canal se almacenan
cifrados en `ChannelConfig.secretsEncrypted` (AES-256-GCM, clave `CHANNEL_SECRET`).
El campo `ChannelConfig.config` guarda configuración no sensible (JSON plano).
**Nunca pongas secrets en `config`.**

---

## 2. Variables de entorno requeridas

Todas las variables se definen en `.env` (local) o en los secrets del CI/CD.
**Nunca commitees valores reales.**

### Base de datos y cifrado (todos los canales)

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Clave AES-256-GCM para cifrar/descifrar ChannelConfig.secretsEncrypted
CHANNEL_SECRET=32-bytes-hex-o-base64-aqui
```

### WhatsApp Business API (Meta Cloud API)

Las credenciales de WhatsApp se almacenan en `ChannelConfig.secretsEncrypted`
como JSON con los siguientes campos (extraídos de `whatsapp.adapter.ts`):

```json
{
  "accessToken":    "EAAB...",
  "phoneNumberId":  "1234567890",
  "verifyToken":    "tu-verify-token-secreto",
  "appSecret":      "tu-app-secret"
}
```

> **Nota:** `appSecret` es opcional. Si se omite, la verificación de firma
> HMAC-SHA256 en el header `x-hub-signature-256` se desactiva.

### Telegram Bot API

Las credenciales de Telegram se almacenan en `ChannelConfig.secretsEncrypted`
como JSON con los siguientes campos (extraídos de `telegram.adapter.ts`):

```json
{
  "botToken":       "123456789:AAF...",
  "webhookSecret":  "tu-secret-aqui"
}
```

> **Nota:** `webhookSecret` es opcional pero **recomendado**. Si está presente,
> el adapter valida el header `x-telegram-bot-api-secret-token`.

Además, para el auto-registro del webhook al iniciar:

```env
# URL base pública del gateway (sin trailing slash).
# Si está definida, telegram.adapter.ts registra el webhook automáticamente al iniciar.
TELEGRAM_WEBHOOK_URL=https://tu-dominio.com
```

### Discord

Las credenciales de Discord se almacenan en `ChannelConfig.secretsEncrypted`
como JSON con los siguientes campos (extraídos de `discord.commands.ts` y
`discord.adapter.ts`):

```json
{
  "applicationId": "123456789012345678",
  "publicKey":     "abcdef0123456789...",
  "botToken":      "MTIz..."
}
```

### Microsoft Teams

Teams soporta dos modos (extraído de `teams-mode.strategy.ts`):

**Modo `bot_framework` (bidireccional — recomendado):**

```json
{
  "appId":       "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "appPassword": "tu-client-secret"
}
```

**Modo `incoming_webhook` (solo envío — más simple):**

```json
{
  "webhookUrl": "https://outlook.office.com/webhook/..."
}
```

> **Detección automática de modo:** si `secretsEncrypted` contiene `webhookUrl`,
> el adapter usa `incoming_webhook`. Si contiene `appId` + `appPassword`, usa
> `bot_framework`. El campo `config.mode` tiene prioridad si está definido
> explícitamente.

---

## 3. Provisionamiento: WhatsApp

### Paso 1 — Crear la app en Meta Developers

1. Ve a [developers.facebook.com](https://developers.facebook.com/) → My Apps → Create App
2. Selecciona tipo **Business**
3. Agrega el producto **WhatsApp**
4. En WhatsApp → Configuration → Webhook, configura:
   - **Callback URL:** `https://tu-dominio.com/gateway/whatsapp/webhook`
   - **Verify Token:** el valor de `verifyToken` que usarás en `secretsEncrypted`
5. Suscríbete al evento `messages`

### Paso 2 — Obtener credenciales

| Campo en `secretsEncrypted` | Dónde obtenerlo |
|-----------------------------|-----------------|
| `accessToken` | WhatsApp → API Setup → Temporary/Permanent token |
| `phoneNumberId` | WhatsApp → API Setup → Phone Number ID |
| `verifyToken` | Lo defines tú (string secreto arbitrario) |
| `appSecret` | App → Settings → Basic → App Secret |

### Paso 3 — Crear ChannelConfig en BD

El adapter lee credentials desde `secretsEncrypted` (cifrado AES-256-GCM).
Usa el servicio de administración o inserta directamente con el valor cifrado:

```sql
-- Insertar con secretsEncrypted ya cifrado por tu servicio (no insertes plaintext)
INSERT INTO "ChannelConfig" (
  id, type, name, "secretsEncrypted", config,
  "isActive", "botStatus", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'whatsapp',
  'WhatsApp Principal',
  '<valor-cifrado-por-CHANNEL_SECRET>',
  '{"webhookPath": "/webhook"}',
  true,
  'initializing',
  now(), now()
);
```

> El `id` generado es el `channelConfigId` que identifica este canal.

### Paso 4 — Verificar que el webhook pasa la verificación

```bash
# Meta enviará un GET con hub.challenge al registrar el webhook.
# Verifica manualmente:
curl "https://tu-dominio.com/gateway/whatsapp/webhook\
?hub.mode=subscribe\
&hub.challenge=TEST123\
&hub.verify_token=TU_VERIFY_TOKEN"
# Debe responder: TEST123
```

### Paso 5 — Enviar mensaje de prueba

Envía un mensaje de texto al número de WhatsApp desde un número en lista blanca.
El gateway debe procesar el webhook (log `[whatsapp] Initialized for phoneNumberId ...`)
y la respuesta del agente debe llegar al usuario en menos de 10 segundos.

---

## 4. Provisionamiento: Telegram

### Paso 1 — Crear el bot con @BotFather

```
/newbot
Nombre: MiAgente Bot
Username: mi_agente_bot
→ Token: 123456789:AAF...
```

### Paso 2 — Crear ChannelConfig en BD

```sql
INSERT INTO "ChannelConfig" (
  id, type, name, "secretsEncrypted", config,
  "isActive", "botStatus", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'telegram',
  'Telegram Principal',
  '<valor-cifrado-por-CHANNEL_SECRET>',
  '{}',
  true,
  'initializing',
  now(), now()
);
```

> El JSON cifrado debe contener: `{"botToken": "...", "webhookSecret": "..."}`.

### Paso 3 — Registrar el webhook con Telegram

**Opción A — Automático:** define `TELEGRAM_WEBHOOK_URL` en el entorno.
`telegram.adapter.ts` llama a `autoSetupWebhook()` al inicializar y registra:
`{TELEGRAM_WEBHOOK_URL}/gateway/telegram/webhook`.

**Opción B — Manual via endpoint:**

```bash
curl -X POST "https://tu-dominio.com/gateway/telegram/setup" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://tu-dominio.com/gateway/telegram/webhook"}'
```

**Opción C — Directo a la API de Telegram:**

```bash
curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-dominio.com/gateway/telegram/webhook",
    "secret_token": "TU_WEBHOOK_SECRET",
    "allowed_updates": ["message", "callback_query"]
  }'
# Respuesta esperada: {"ok":true,"result":true,"description":"Webhook was set"}
```

### Paso 4 — Verificar el webhook

```bash
curl "https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo"
# Verificar: "url" tiene tu dominio, "last_error_message" está vacío
```

### Paso 5 — Test de smoke

Envía `/start` o un mensaje de texto al bot desde Telegram.
Debe aparecer una respuesta del agente en menos de 5 segundos.

---

## 5. Provisionamiento: Discord

### Paso 1 — Crear la aplicación y el bot

1. Ve a [discord.com/developers/applications](https://discord.com/developers/applications) → New Application
2. En **General Information**, copia la **Public Key** y el **Application ID**
3. En **Bot** → Add Bot → copia el **Token**
4. En **General Information** → **Interactions Endpoint URL:**
   ```
   https://tu-dominio.com/gateway/discord/interactions
   ```
   Discord hará una verificación con un PING (`type=1`) — el adapter debe responder `{"type":1}`

### Paso 2 — Instalar el bot en el servidor (guild)

```
https://discord.com/api/oauth2/authorize
  ?client_id={DISCORD_APPLICATION_ID}
  &permissions=2048
  &scope=bot%20applications.commands
```

`2048` = permiso Send Messages. Ajusta según lo que necesite el bot.

### Paso 3 — Registrar slash commands

El adapter registra los comandos al inicializar. El registro puede ser:

- **Guild commands (desarrollo):** instantáneos, definidos por `DiscordCommandRegistry.registerGuild(guildId)`.
- **Global commands (producción):** tardan ~1 hora en propagarse, definidos por `DiscordCommandRegistry.registerGlobal()`.

Para forzar el registro manual de guild commands:

```typescript
import { DiscordCommandRegistry } from './discord.commands';
const registry = new DiscordCommandRegistry(botToken, applicationId);
await registry.registerGuild('TU_GUILD_ID');
```

Los comandos registrados son `/ask` y `/status` (definidos en `DISCORD_SLASH_COMMANDS`).

### Paso 4 — Crear ChannelConfig en BD

```sql
INSERT INTO "ChannelConfig" (
  id, type, name, "secretsEncrypted", config,
  "isActive", "botStatus", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'discord',
  'Discord Principal',
  '<valor-cifrado-por-CHANNEL_SECRET>',
  '{}',
  true,
  'initializing',
  now(), now()
);
```

> El JSON cifrado debe contener:
> `{"applicationId": "...", "publicKey": "...", "botToken": "..."}`.

### Paso 5 — Crear ChannelBinding (vincular guild o canal a un agente)

El modelo `ChannelBinding` en Prisma usa `scopeLevel` y `scopeId`:

```sql
-- Binding para todo un guild (scope = guild ID)
INSERT INTO "ChannelBinding" (
  id, "channelConfigId", "agentId",
  "scopeLevel", "scopeId",
  "isDefault", "createdAt"
) VALUES (
  gen_random_uuid(),
  '{channelConfigId}',
  '{agentId}',
  'guild',
  '{guildId}',
  false,
  now()
);

-- Binding más específico para un canal concreto (prioridad sobre guild)
INSERT INTO "ChannelBinding" (
  id, "channelConfigId", "agentId",
  "scopeLevel", "scopeId",
  "isDefault", "createdAt"
) VALUES (
  gen_random_uuid(),
  '{channelConfigId}',
  '{agentId}',
  'channel',
  '{channelId}',
  false,
  now()
);
```

> **Prioridad de resolución** (extraída de `discord.commands.ts`):
> `makeBindingResolver` busca primero por `externalChannelId` (channel binding),
> luego por `externalGuildId` (guild binding). Inserta el binding de guild primero
> y el de canal específico después.

### Paso 6 — Verificar

En Discord, ejecuta `/status` en el canal vinculado.
Debe responder con el `agentId` y el scope (`channel` o `guild`).

---

## 6. Provisionamiento: Microsoft Teams

### Modo A — Incoming Webhook (solo envío, sin Azure)

1. En Teams → Canal → ··· → Connectors → Incoming Webhook → Configure
2. Dale un nombre y copia la URL generada (`webhookUrl`)
3. Crea el `ChannelConfig` con `{"webhookUrl": "https://..."}` en `secretsEncrypted`

### Modo B — Bot Framework (bidireccional — recomendado)

#### Paso 1 — Registrar el bot en Azure

1. Ve a [portal.azure.com](https://portal.azure.com/) → App Registrations → New Registration
2. Tipo: **Accounts in any organizational directory** (Multi-tenant) o single-tenant
3. Copia el **Application (client) ID** → `appId`
4. En **Certificates & Secrets** → New client secret → copia el valor → `appPassword`

#### Paso 2 — Crear el Azure Bot

1. Ve a Azure Bot → Create
2. En **Messaging endpoint:** `https://tu-dominio.com/gateway/teams/messages`
3. Asocia la App Registration del Paso 1

#### Paso 3 — Agregar el canal de Teams

En Azure Bot → Channels → Microsoft Teams → habilitar.

#### Paso 4 — Crear ChannelConfig en BD

```sql
INSERT INTO "ChannelConfig" (
  id, type, name, "secretsEncrypted", config,
  "isActive", "botStatus", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'teams',
  'Teams Principal',
  '<valor-cifrado-por-CHANNEL_SECRET>',
  '{"mode": "bot_framework"}',
  true,
  'initializing',
  now(), now()
);
```

> El JSON cifrado debe contener: `{"appId": "...", "appPassword": "..."}`.
> El campo `config.mode` puede ser `"bot_framework"` o `"incoming_webhook"`.
> Si se omite, el adapter lo detecta automáticamente por la presencia de
> `appId`/`appPassword` vs `webhookUrl` (lógica en `teams-mode.strategy.ts`).

#### Paso 5 — Instalar la app en Teams

- En Teams → Apps → Upload a custom app (requiere permisos de admin), o
- Usar Teams Admin Center para deployment a toda la organización.
- El bot debe aparecer en Teams y responder a mensajes directos.

#### Paso 6 — Verificar la verificación JWT

```bash
curl -s https://tu-dominio.com/gateway/teams/health
# Debe responder: {"status":"ok","channel":"teams","mode":"bot_framework",...}
```

---

## 7. Modelo de datos: ChannelConfig y ChannelBinding

```
ChannelConfig                          (apps/gateway — un registro por canal)
  id                UUID PK
  type              ChannelType enum   telegram | whatsapp | webchat | discord | teams | slack | webhook
  name              string
  secretsEncrypted  string (Text)      ← AES-256-GCM, clave CHANNEL_SECRET. NUNCA en logs.
  config            Json               ← Configuración no sensible: webhookPath, parseMode, mode, etc.
  isActive          boolean
  botStatus         BotStatus enum     initializing | online | offline | error | rate_limited | webhook_error
  statusDetail      string?            ← Detalle del último error
  statusUpdatedAt   datetime?
  createdAt         datetime
  updatedAt         datetime

ChannelBinding                         (vincula un ChannelConfig a un Agent)
  id                UUID PK
  channelConfigId   FK → ChannelConfig
  agentId           FK → Agent
  scopeLevel        string             ← 'agency' | 'department' | 'workspace' | 'agent'
  scopeId           string             ← ID de la entidad del scope (agencyId, guildId, channelId, etc.)
  isDefault         boolean
  createdAt         datetime

GatewaySession                         (una sesión por usuario por canal)
  id                UUID PK
  channelConfigId   FK → ChannelConfig
  externalUserId    string             ← chat_id de Telegram, número de WhatsApp, userId de Discord, etc.
  agentId           string
  activeContextJson Json?              ← Ventana de tokens activa (historial en ConversationMessage)
  state             string             'active' | 'paused' | 'closed'
  metadata          Json?
```

**Regla de resolución de binding para Discord** (implementada en `makeBindingResolver` de `discord.commands.ts`):

1. Buscar binding donde `scopeLevel === 'channel'` y `scopeId === messageChannelId`
2. Si no encuentra, buscar donde `scopeLevel === 'guild'` y `scopeId === messageGuildId`
3. Si no encuentra → devolver `null` → respuesta "No hay agente vinculado a este servidor/canal."

---

## 8. Troubleshooting por canal

### WhatsApp

| Síntoma | Causa probable | Diagnóstico | Solución |
|---------|---------------|-------------|----------|
| Meta rechaza el webhook (verificación falla) | `verifyToken` incorrecto o endpoint no responde | `curl GET /gateway/whatsapp/webhook?hub.mode=subscribe&hub.challenge=TEST&hub.verify_token=TOKEN` → debe responder `TEST` | Verificar campo `verifyToken` en `secretsEncrypted` del ChannelConfig |
| 401 en webhook POST | Firma HMAC inválida | Buscar en logs: `[whatsapp] send failed` con 401. Verificar que `appSecret` en `secretsEncrypted` coincide con el App Secret de Meta | Regenerar App Secret en Meta y re-cifrar `secretsEncrypted` |
| Mensajes llegan pero no hay respuesta al usuario | `accessToken` expirado | Logs: `[whatsapp] send failed: ...401`. El token temporal caduca cada 24h | Generar token permanente en Meta → System Users → Generate Token |
| Webhook recibido pero AgentExecutor no se llama | Mensaje no es de tipo `text` | Logs: el adapter solo emite `IncomingMessage` para `waMsg.type === 'text'` | Comportamiento correcto — el gateway ignora imágenes/audio/documentos por diseño (F3a scope) |
| Error 400 al enviar respuesta | Número no en lista blanca (modo sandbox) | Revisar respuesta de Meta API en logs de `[whatsapp] send failed` | Agregar número a la lista de prueba en Meta → WhatsApp → API Setup |
| Gateway recibe pero Meta no muestra entregado | `phoneNumberId` incorrecto | Verificar en logs que el envío a `https://graph.facebook.com/v19.0/{phoneNumberId}/messages` es exitoso | Corregir `phoneNumberId` en `secretsEncrypted` |

### Telegram

| Síntoma | Causa probable | Diagnóstico | Solución |
|---------|---------------|-------------|----------|
| 403 en el webhook | `webhookSecret` no coincide | Header `x-telegram-bot-api-secret-token` incorrecto | Verificar `webhookSecret` en `secretsEncrypted`. Re-registrar webhook con el secret correcto |
| Bot no responde en Telegram | Webhook no registrado o URL incorrecta | `getWebhookInfo` → campo `url` vacío o con URL vieja | Ejecutar `autoSetupWebhook` via `TELEGRAM_WEBHOOK_URL` o endpoint `/setup` |
| Telegram muestra "webhook was set but there were errors" | El gateway devuelve non-200 | `getWebhookInfo` → campo `last_error_message` | Revisar logs del gateway. Causa frecuente: excepción en AgentExecutor no capturada. El adapter debe responder `200` siempre |
| Respuestas duplicadas | Telegram reintenta el webhook porque el gateway tardó >5s | `getWebhookInfo` → `pending_update_count` alto | Procesar updates con idempotencia por `update_id`. Asegurarse de que el gateway responde `{"ok":true}` siempre, incluso con errores del agente |
| Fotos, documentos o stickers no procesados | Comportamiento esperado | Log: el adapter solo emite si `message?.text` está presente | Por diseño (scope F3a). Para multimedia implementar en F4+ |
| Bot responde correctamente en texto plano pero no en Markdown | `parse_mode: 'Markdown'` con caracteres especiales | Revisar texto del agente — caracteres `_`, `*`, `` ` `` sin escapar causan error Telegram | El agente debe escapar Markdown o usar `parse_mode: 'MarkdownV2'` |

### Discord

| Síntoma | Causa probable | Diagnóstico | Solución |
|---------|---------------|-------------|----------|
| Discord muestra "La interacción ha fallado" | Gateway no respondió en 3 segundos | Revisar latencia de AgentExecutor. El adapter debe responder `{"type":5}` (deferral) de inmediato | Implementar deferral: responder `{"type":5}` de forma síncrona y enviar texto via PATCH al followup URL |
| PING de Discord no recibe PONG | Endpoint no responde con `{"type":1}` o firma inválida | `curl -X POST /gateway/discord/interactions -H "..."` → debe responder `{"type":1}` | El adapter debe manejar `type === 1` antes de verificar firma Ed25519 |
| "Invalid interaction application command" | Slash commands no registrados o desactualizados | Verificar en Discord Developer Portal si los commands existen para el guild | Llamar a `DiscordCommandRegistry.registerGuild(guildId)` o `registerGlobal()` |
| `/ask` responde "No hay agente vinculado a este servidor/canal" | No existe `ChannelBinding` | `SELECT * FROM "ChannelBinding" WHERE "channelConfigId" = '{id}'` | Crear binding con `scopeLevel='guild'` y `scopeId='{guildId}'` o `scopeLevel='channel'` |
| Firma Ed25519 inválida en todos los requests | `publicKey` incorrecto en `secretsEncrypted` | Comparar clave en BD vs Applications → General Information → Public Key | Re-cifrar `secretsEncrypted` con la `publicKey` correcta |
| `/status` muestra scope o agentId incorrecto | Múltiples bindings con priorización incorrecta | `SELECT * FROM "ChannelBinding" WHERE "channelConfigId"='{id}' ORDER BY "createdAt"` | Verificar que el binding de `scopeLevel='channel'` tiene el `scopeId` correcto |

### Microsoft Teams

| Síntoma | Causa probable | Diagnóstico | Solución |
|---------|---------------|-------------|----------|
| 401 en todos los mensajes entrantes | `appId`/`appPassword` incorrectos o expirados | Logs: `[TeamsAdapter] Auth rejected: expected appid=...`. El adapter decodifica el JWT y compara el claim `appid` | Regenerar Client Secret en Azure App Registration y re-cifrar `secretsEncrypted` |
| Bot no responde en Teams pero el endpoint recibe los payloads | `serviceUrl` incorrecto al enviar respuesta | Logs: revisar que la estrategia usa `activity.serviceUrl` del payload entrante, no un URL hardcodeado | `serviceUrl` varía por tenant/región. `BotFrameworkStrategy.send()` requiere el `serviceUrl` del Activity entrante |
| Bot responde fuera del contexto de la conversación | `conversation.id` incorrecto al construir la respuesta | Log la Activity de respuesta antes de enviar | El adapter copia `conversation.id` del Activity entrante al normalizar en `_normalizeActivity()` |
| `conversationUpdate` dispara el agente inesperadamente | El adapter no filtra `conversationUpdate` | Log: `[TeamsAdapter] conversationUpdate` sin manejo | `teams-bot.adapter.ts` ya maneja `conversationUpdate` con log y `200 OK` sin emitir al agente — verificar versión desplegada |
| Bot no aparece en Teams | App no instalada o no aprobada por admin | Verificar Teams Admin Center → Manage Apps | Instalar app desde Admin Center o usando `manifest.json` |
| Modo `incoming_webhook` no recibe mensajes | Comportamiento esperado | Log: `400 — Este canal Teams está configurado como Incoming Webhook` | Para recibir mensajes, cambiar a `bot_framework` en `config.mode` |
| Token de Bearer expirado en mitad de operación | `BotFrameworkStrategy` no renovó el token | Logs: `[TeamsBotFramework] Token request failed` | El token se renueva automáticamente (buffer de 60s antes de expirar). Si falla, verificar conectividad a `login.microsoftonline.com` |

---

## 9. Checklist de verificación post-deploy

Ejecutar después de cada deploy a staging o producción.

### Verificación automática (smoke tests)

```bash
# Desde la raíz del proyecto:
pnpm --filter gateway test:e2e -- --reporter=verbose

# O smoke test específico contra el entorno:
GATEWAY_URL=https://tu-dominio.com pnpm --filter gateway test:smoke
```

### Verificación manual por canal

**WhatsApp:**

```bash
# 1. Verificación del webhook
curl "https://tu-dominio.com/gateway/whatsapp/webhook\
?hub.mode=subscribe&hub.challenge=SMOKE_TEST&hub.verify_token=TU_VERIFY_TOKEN"
# → Debe responder: SMOKE_TEST

# 2. Enviar mensaje de texto al número de WhatsApp desde un número verificado
# → Recibir respuesta del agente en <10s
```

**Telegram:**

```bash
# 1. Estado del webhook
curl "https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo"
# → url correcto, last_error_message vacío, pending_update_count < 10

# 2. Enviar "hola" al bot → recibir respuesta en <5s
```

**Discord:**

```bash
# 1. Verificar PING-PONG
# (Discord lo hace automáticamente al registrar el Interactions Endpoint URL)

# 2. En Discord, ejecutar /status en un canal vinculado
# → Muestra agentId y scope (channel o guild)

# 3. Ejecutar /ask ¿estás funcionando?
# → Respuesta en <3s (sin "La interacción ha fallado")
```

**Teams:**

```bash
# 1. Healthcheck del adapter
curl https://tu-dominio.com/gateway/teams/health
# → {"status":"ok","channel":"teams","mode":"bot_framework",...}

# 2. Mensaje directo al bot en Teams → respuesta en <5s
# 3. conversationUpdate → NO debe disparar respuesta del agente
```

### Métricas a monitorear post-deploy

| Métrica | Umbral de alerta |
|---------|-----------------|
| `gateway.webhook.latency_p99` | > 2500ms |
| `gateway.agent_executor.error_rate` | > 5% en 5 min |
| `gateway.auth.rejection_rate` por canal | > 10% en 5 min |
| `gateway.session.upsert_errors` | > 0 |
| `gateway.teams.token_refresh_errors` | > 0 |

---

## 10. Runbook de incidencias comunes

### INC-001: Gateway devuelve 500 en todos los canales

```
Síntoma:   Todos los webhooks devuelven 500
Causa:     Error de conexión con PostgreSQL o Prisma Client no inicializado
Diagnóstico:
  1. curl https://tu-dominio.com/health → debe responder {"status":"ok"}
  2. Revisar logs: buscar "PrismaClientInitializationError"
  3. Verificar variable DATABASE_URL y conectividad a la BD
Resolución:
  - Si BD no accesible: verificar security groups y connection string
  - Si Prisma no inicializado: reiniciar el servicio gateway
  - Si persiste: rollback del último deploy
```

### INC-002: Mensajes llegan con retraso de >30 segundos

```
Síntoma:   Los mensajes se entregan pero con alta latencia
Causa A:   AgentExecutor esperando respuesta del LLM (normal en modelos lentos)
Causa B:   Cola de mensajes acumulada
Diagnóstico:
  1. Revisar logs de tiempo de respuesta del AgentExecutor
  2. Comparar latencia de LLM vs latencia total
  3. Revisar si Telegram muestra pending_update_count alto (INC-004)
Resolución A:   Cambiar modelo a uno más rápido o usar streaming
Resolución B:   Escalar horizontalmente el gateway (añadir instancias)
```

### INC-003: Bot de Discord responde "La interacción ha fallado" en todos los /ask

```
Síntoma:   Discord muestra error en todos los slash commands
Causa:     AgentExecutor tarda más de 3 segundos (límite de Discord)
Diagnóstico:
  1. Verificar que el adapter implementa deferral (responde {"type":5} de inmediato)
  2. Si deferral está implementado, buscar errores en el PATCH al followup URL
  3. Revisar: interaction token expira en 15 minutos
Resolución:
  - Implementar/verificar deferral en discord.adapter.ts:
      res.json({ type: 5 })  // ACK inmediato
      // ... procesar ...
      PATCH /webhooks/{appId}/{token}/messages/@original  { content: respuesta }
  - Asegurarse de usar el token del interaction payload entrante
```

### INC-004: Telegram envía respuestas duplicadas

```
Síntoma:   Los usuarios reciben 2-3 respuestas por mensaje
Causa:     Telegram reintenta el webhook porque el gateway tardó >5s o devolvió non-200
Diagnóstico:
  1. getWebhookInfo → pending_update_count alto indica reintentos
  2. Buscar en logs el mismo update_id procesado más de una vez
Resolución:
  1. El gateway DEBE responder {"ok":true} inmediatamente (antes de procesar el agente)
     telegram.adapter.ts ya hace esto: res.json({ ok: true }) antes del bucle de mensajes
  2. Si el problema persiste, implementar deduplicación por update_id
     con una entrada en BD con TTL de 10 minutos
```

### INC-005: WhatsApp deja de recibir mensajes después de días

```
Síntoma:   Funciona bien al principio, deja de recibir webhooks después de 24h-48h
Causa A:   accessToken expirado (tokens temporales de Meta duran 24h)
Causa B:   Meta deshabilitó el webhook por errores acumulados (>10% de respuestas non-200)
Diagnóstico:
  1. Verificar en Meta Developers → Webhooks → estado del webhook
  2. Intentar llamar a la API de WhatsApp con el accessToken actual
     curl "https://graph.facebook.com/v19.0/{phoneNumberId}/messages" \
       -H "Authorization: Bearer {accessToken}" → debe devolver 200
Resolución A:   Generar token permanente con System User en Meta Business Manager
Resolución B:   Corregir los errores que causaron las fallas, re-verificar el webhook en Meta
```

### INC-006: CHANNEL_SECRET perdida o rotada — secretsEncrypted no descifra

```
Síntoma:   Gateway no puede leer credenciales de ningún canal → todos fallan al iniciar
Causa:     La clave CHANNEL_SECRET en el entorno no coincide con la usada al cifrar
Diagnóstico:
  1. Logs: error de descifrado AES al leer ChannelConfig.secretsEncrypted
  2. Verificar que CHANNEL_SECRET en el entorno actual coincide con el que se usó para cifrar
Resolución:
  - Si tienes la clave antigua: actualizar CHANNEL_SECRET a la clave correcta
  - Si la clave se perdió definitivamente: regenerar todos los secretsEncrypted
    re-cifrando las credenciales de cada canal con la nueva clave
  IMPORTANTE: nunca almacenes CHANNEL_SECRET en el código — solo en secrets del CI/CD
```

### INC-007: Teams — bearer token no se puede obtener

```
Síntoma:   Todos los envíos de Teams fallan. Logs: "Token request failed"
Causa:     appPassword expirado, appId incorrecto, o conectividad a login.microsoftonline.com
Diagnóstico:
  1. Verificar conectividad: curl https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token
  2. Verificar que el Client Secret en Azure no haya expirado (Azure → App Reg → Certificates & Secrets)
Resolución:
  1. Regenerar el Client Secret en Azure
  2. Re-cifrar secretsEncrypted con el nuevo appPassword
  3. Reiniciar el servicio gateway
```

### INC-008: Discord — slash commands no aparecen en el servidor

```
Síntoma:   Los usuarios no ven /ask ni /status en Discord
Causa A:   Commands registrados como guild commands en un guild diferente
Causa B:   Global commands no propagados (pueden tardar hasta 1 hora)
Diagnóstico:
  1. GET https://discord.com/api/v10/applications/{appId}/guilds/{guildId}/commands
     con Authorization: Bot {botToken} → verificar que /ask y /status existen
  2. Si están registrados globalmente, esperar hasta 1 hora
Resolución:
  - Para desarrollo: usar DiscordCommandRegistry.registerGuild(guildId) (instantáneo)
  - Para producción: usar DiscordCommandRegistry.registerGlobal() y esperar propagación
  - Verificar que applicationId en secretsEncrypted coincide con la app en Discord Developer Portal
```

### INC-009: GatewaySession no se crea — externalUserId duplicado

```
Síntoma:   Error al upsert GatewaySession: violación de unique constraint
Causa:     (channelConfigId, externalUserId) ya existe pero con agentId diferente
Diagnóstico:
  1. SELECT * FROM "GatewaySession" WHERE "channelConfigId"='{id}' AND "externalUserId"='{userId}'
Resolución:
  - El upsert debe usar ON CONFLICT (channelConfigId, externalUserId) DO UPDATE
  - Si el agentId cambió (re-binding), actualizar la sesión existente o cerrarla y crear una nueva
```

### INC-010: Todos los canales online pero AgentExecutor falla con timeout

```
Síntoma:   Los webhooks se reciben, las sesiones se crean, pero el agente no responde
Causa A:   LLM provider no accesible o API key inválida
Causa B:   AgentExecutor timeout (25s en Teams, sin límite explícito en otros canales)
Diagnóstico:
  1. Verificar SystemConfig → OPENAI_API_KEY (o la clave del proveedor configurado)
  2. Logs del AgentExecutor: buscar "Agent processing timeout" o errores del LLM client
  3. Revisar ProviderCredential.isActive para el proveedor configurado
Resolución:
  - Actualizar API key en SystemConfig o ProviderCredential
  - Si el LLM está caído: configurar fallback en ModelPolicy.fallbackChain
  - Reiniciar el servicio si el AgentExecutor quedó en estado inconsistente
```

---

> **Contrato de mantenimiento:** si modificas un adapter (`*.adapter.ts`, `*-mode.strategy.ts`
> o `*.commands.ts`), actualiza las secciones correspondientes de este documento en el
> mismo PR. Un runbook desactualizado es peor que no tener runbook.
