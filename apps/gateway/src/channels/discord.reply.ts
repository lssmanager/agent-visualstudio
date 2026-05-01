/**
 * discord.reply.ts — [F3a-29]
 *
 * Módulo de respuestas Discord:
 *   - Embeds ricos a partir de RichContent
 *   - Respuesta a interaction via followup PATCH (slash commands)
 *   - Envío proactivo a canal (REST sin interaction token)
 *   - Chunking automático de mensajes > 2000 chars
 *
 * Este módulo NO hace I/O HTTP por sí solo: recibe un botToken y
 * usa fetch nativo. No depende de discord.js Client.
 *
 * Consumidores:
 *   - DiscordAdapter (reemplaza _sendViaRestApi, _sendViaFollowup, richContentToEmbed)
 *   - DiscordCommandDispatcher (para responder slash commands vía followup)
 */

// ── Constantes ─────────────────────────────────────────────────────────────────────

export const DISCORD_API        = 'https://discord.com/api/v10'
export const MAX_CONTENT_LENGTH = 2000

// ── Tipos públicos ──────────────────────────────────────────────────────────────────

/** Embed Discord mínimo para respuestas del agente */
export interface DiscordEmbed {
  title?:       string
  description?: string
  color?:       number           // entero decimal, ej: 0x5865F2 = 5793266
  fields?:      DiscordEmbedField[]
  footer?:      { text: string }
  image?:       { url: string }
  thumbnail?:   { url: string }
  timestamp?:   string           // ISO 8601
}

export interface DiscordEmbedField {
  name:    string
  value:   string
  inline?: boolean
}

/** Payload de richContent de OutgoingMessage normalizado para Discord */
export interface RichContent {
  title?:       string
  description?: string
  color?:       number
  fields?:      DiscordEmbedField[]
  footer?:      string
  imageUrl?:    string
  thumbnail?:   string
  buttons?:     Array<{ label: string; value: string }>
}

/** Opciones para envío proactivo a un canal */
export interface SendToChannelOptions {
  botToken:     string
  channelId:    string
  text?:        string
  richContent?: RichContent
}

/** Opciones para respuesta a interaction via followup PATCH */
export interface SendFollowupOptions {
  botToken:         string
  applicationId:    string
  interactionToken: string
  text?:            string
  richContent?:     RichContent
  /** Si true, la respuesta solo la ve el usuario que ejecutó el comando */
  ephemeral?:       boolean
}

/** Resultado de un envío */
export interface DiscordSendResult {
  ok:      boolean
  chunks:  number   // cuántos mensajes se enviaron (por chunking)
  error?:  string
}

// ── Función: buildEmbed ───────────────────────────────────────────────────────────

/**
 * Convierte un RichContent en un objeto embed listo para la API de Discord.
 * El campo _components (botones) es separado del embed proper y debe
 * extraerse con destructuring antes de enviar: const { _components, ...embed } = buildEmbed(rc)
 */
export function buildEmbed(rc: RichContent): DiscordEmbed & { _components?: unknown[] } {
  const embed: DiscordEmbed & { _components?: unknown[] } = {}

  if (rc.title)       embed.title       = rc.title
  if (rc.description) embed.description = rc.description
  if (rc.color)       embed.color       = rc.color
  if (rc.fields)      embed.fields      = rc.fields
  if (rc.footer)      embed.footer      = { text: rc.footer }
  if (rc.imageUrl)    embed.image       = { url: rc.imageUrl }
  if (rc.thumbnail)   embed.thumbnail   = { url: rc.thumbnail }

  // Botones como action row (componente separado del embed, va en el mensaje)
  if (rc.buttons?.length) {
    embed._components = [
      {
        type: 1,  // ACTION_ROW
        components: rc.buttons.map((b) => ({
          type:      2,       // BUTTON
          style:     1,       // PRIMARY (blurple)
          label:     b.label,
          custom_id: b.value,
        })),
      },
    ]
  }

  return embed
}

// ── Función: splitMessage ──────────────────────────────────────────────────────────

/**
 * Divide un texto en chunks de maxLen caracteres respetando espacios.
 * Garantiza que ningún chunk supere MAX_CONTENT_LENGTH.
 */
export function splitMessage(text: string, maxLen = MAX_CONTENT_LENGTH): string[] {
  if (!text) return []
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > maxLen) {
    let idx = remaining.lastIndexOf(' ', maxLen)
    if (idx <= 0) idx = maxLen
    chunks.push(remaining.slice(0, idx))
    remaining = remaining.slice(idx).trimStart()
  }

  if (remaining.length > 0) chunks.push(remaining)
  return chunks
}

// ── Función: sendToChannel ──────────────────────────────────────────────────────────

/**
 * Envía un mensaje proactivo a un canal de Discord vía REST.
 * No requiere interaction token — usa POST /channels/:id/messages.
 *
 * Si el texto supera 2000 chars, envía múltiples mensajes (chunking).
 * El embed/richContent solo se adjunta al último chunk.
 */
export async function sendToChannel(opts: SendToChannelOptions): Promise<DiscordSendResult> {
  const { botToken, channelId, text = '', richContent } = opts
  const chunks = text ? splitMessage(text) : ['']

  let sent = 0
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1
    const body: Record<string, unknown> = {}

    if (chunks[i]) body['content'] = chunks[i]

    if (isLast && richContent) {
      const embed = buildEmbed(richContent)
      const { _components, ...cleanEmbed } = embed
      body['embeds'] = [cleanEmbed]
      if (_components) body['components'] = _components
    }

    const result = await _request(
      'POST',
      `${DISCORD_API}/channels/${channelId}/messages`,
      botToken,
      body,
    )

    if (!result.ok) {
      return { ok: false, chunks: sent, error: result.error }
    }

    sent++
  }

  return { ok: true, chunks: sent }
}

// ── Función: sendFollowup ───────────────────────────────────────────────────────────

/**
 * Edita el mensaje diferido de un slash command vía PATCH followup.
 * Debe llamarse DESPUÉS de que Discord recibió el ACK type=5.
 */
export async function sendFollowup(opts: SendFollowupOptions): Promise<DiscordSendResult> {
  const {
    botToken, applicationId, interactionToken,
    text = '', richContent, ephemeral = false,
  } = opts

  const content = text.slice(0, MAX_CONTENT_LENGTH)
  const body: Record<string, unknown> = {}

  if (content) body['content'] = content
  if (ephemeral) body['flags'] = 64  // EPHEMERAL flag

  if (richContent) {
    const embed = buildEmbed(richContent)
    const { _components, ...cleanEmbed } = embed
    body['embeds'] = [cleanEmbed]
    if (_components) body['components'] = _components
  }

  const url = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`
  const result = await _request('PATCH', url, botToken, body)

  if (!result.ok) {
    return { ok: false, chunks: 0, error: result.error }
  }

  return { ok: true, chunks: 1 }
}

// ── Función: sendEphemeralFollowup ────────────────────────────────────────────────

/**
 * Atajo para respuesta efímera (solo visible para el usuario que ejecutó el comando).
 * Útil para mensajes de error o de estado.
 */
export async function sendEphemeralFollowup(
  opts: Omit<SendFollowupOptions, 'ephemeral'>,
): Promise<DiscordSendResult> {
  return sendFollowup({ ...opts, ephemeral: true })
}

// ── Helper privado: _request ───────────────────────────────────────────────────────

async function _request(
  method:   string,
  url:      string,
  botToken: string,
  body:     Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization:  `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text}` }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}
