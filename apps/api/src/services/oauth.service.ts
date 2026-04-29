/**
 * OAuthService — Flujo PKCE completo para providers OAuth
 *
 * Soporta el flow documentado en https://docs.openclaw.ai/concepts/oauth
 * Actualmente implementado para openai-codex (ChatGPT OAuth).
 * Extensible a copilot y cualquier provider con authType = 'oauth'.
 *
 * Responsabilidades:
 *   1. initiateFlow()   — genera PKCE, abre URL, captura callback HTTP o paste
 *   2. exchangeCode()   — POST al token endpoint, guarda OAuthToken cifrado
 *   3. getAccessToken() — punto de entrada para el flow-engine; refresca si expira
 *   4. refreshToken()   — refresca bajo mutex en memoria (evita double-refresh)
 *   5. revokeToken()    — elimina OAuthToken de la DB
 */

import crypto from 'node:crypto'
import http    from 'node:http'
import { URL } from 'node:url'

import { PrismaClient } from '@prisma/client'

// ── Constantes por provider ──────────────────────────────────────────────────

const OAUTH_CONFIGS: Record<string, OAuthProviderConfig> = {
  'openai-codex': {
    authorizeUrl:  'https://auth.openai.com/oauth/authorize',
    tokenUrl:      'https://auth.openai.com/oauth/token',
    // client_id público documentado por OpenClaw / openai-codex OAuth
    clientId:      'app_EMHoLZMNkBMIbHPBMrWFdFbE',
    redirectUri:   'http://127.0.0.1:1455/auth/callback',
    scopes:        'openid profile email offline_access',
  },
  'copilot': {
    authorizeUrl:  'https://github.com/login/oauth/authorize',
    tokenUrl:      'https://github.com/login/oauth/access_token',
    clientId:      process.env.GITHUB_COPILOT_CLIENT_ID ?? '',
    redirectUri:   'http://127.0.0.1:1455/auth/callback',
    scopes:        'read:user',
  },
}

interface OAuthProviderConfig {
  authorizeUrl: string
  tokenUrl:     string
  clientId:     string
  redirectUri:  string
  scopes:       string
}

// ── Cifrado AES-256-GCM ───────────────────────────────────────────────────────
// Mismo patrón que el resto del repo (iv:authTag:ciphertext en hex)

const ENCRYPTION_KEY = Buffer.from(
  process.env.ENCRYPTION_KEY ?? '',
  'hex',
)

function encrypt(plaintext: string): string {
  if (ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)')
  }
  const iv      = crypto.randomBytes(12)
  const cipher  = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(enc: string): string {
  const [ivHex, tagHex, dataHex] = enc.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted token format')
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8')
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier  = crypto.randomBytes(48).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

function generateState(): string {
  return crypto.randomBytes(16).toString('base64url')
}

// ── JWT accountId extractor ───────────────────────────────────────────────────
// Extrae el campo `sub` del access token sin verificar firma
// (la firma ya fue verificada por el servidor OAuth al emitirlo).

function extractSubFromJwt(token: string): string | undefined {
  try {
    const payload = token.split('.')[1]
    if (!payload) return undefined
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return decoded.sub ?? decoded.account_id ?? undefined
  } catch {
    return undefined
  }
}

// ── Callback HTTP listener ────────────────────────────────────────────────────
// Levanta un servidor temporal en 127.0.0.1:1455 que captura el code
// del redirect OAuth. Timeout de 3 minutos.

function waitForCallbackCode(
  expectedState: string,
  timeoutMs = 180_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url    = new URL(req.url ?? '/', 'http://127.0.0.1:1455')
        const code   = url.searchParams.get('code')
        const state  = url.searchParams.get('state')
        const error  = url.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h2>✅ Autenticación completada. Puedes cerrar esta pestaña.</h2>')
        server.close()

        if (error) return reject(new Error(`OAuth error: ${error}`))
        if (state !== expectedState) return reject(new Error('OAuth state mismatch — posible CSRF'))
        if (!code) return reject(new Error('No code received in callback'))

        resolve(code)
      } catch (err) {
        server.close()
        reject(err)
      }
    })

    server.listen(1455, '127.0.0.1', () => {
      // Servidor listo — el caller ya abrió el browser
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Puerto ocupado — modo headless: el usuario pega la URL
        server.close()
        resolve('__paste_mode__')
      } else {
        reject(err)
      }
    })

    setTimeout(() => {
      server.close()
      reject(new Error('OAuth callback timeout (3 min)'))
    }, timeoutMs)
  })
}

// ── Mutex en memoria ─────────────────────────────────────────────────────────
// Evita que dos requests concurrentes refresquen el mismo token.
// Clave: llmProviderId

const refreshLocks = new Map<string, Promise<string>>()

// ── OAuthService ─────────────────────────────────────────────────────────────

export class OAuthService {
  // Buffer antes de expiración para refrescar de forma proactiva (5 min)
  private static readonly REFRESH_BUFFER_MS = 5 * 60 * 1000

  constructor(private readonly prisma: PrismaClient) {}

  // ── 1. initiateFlow ────────────────────────────────────────────────────────
  // Genera PKCE + state, retorna la URL de autorización para abrir en browser.
  // El caller es responsable de abrir la URL (desktop: open/xdg-open, web: redirect).

  initiateFlow(provider: string): {
    authorizeUrl: string
    verifier:     string
    state:        string
  } {
    const config = this.getConfig(provider)
    const { verifier, challenge } = generatePKCE()
    const state = generateState()

    const url = new URL(config.authorizeUrl)
    url.searchParams.set('client_id',             config.clientId)
    url.searchParams.set('redirect_uri',          config.redirectUri)
    url.searchParams.set('response_type',         'code')
    url.searchParams.set('scope',                 config.scopes)
    url.searchParams.set('state',                 state)
    url.searchParams.set('code_challenge',        challenge)
    url.searchParams.set('code_challenge_method', 'S256')

    return { authorizeUrl: url.toString(), verifier, state }
  }

  // ── 2. waitForCallback ─────────────────────────────────────────────────────
  // Levanta el listener HTTP y espera el code. Si el puerto está ocupado
  // (entorno headless / remoto), devuelve '__paste_mode__' para que el
  // caller pida al usuario que pegue la URL de redirect.

  waitForCallback(state: string): Promise<string> {
    return waitForCallbackCode(state)
  }

  // ── 3. exchangeCode ────────────────────────────────────────────────────────
  // Intercambia el authorization code por access + refresh token.
  // Guarda OAuthToken en la DB (upsert — token sink canónico).

  async exchangeCode(
    llmProviderId: string,
    provider:      string,
    code:          string,
    verifier:      string,
  ): Promise<void> {
    const config = this.getConfig(provider)

    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     config.clientId,
      redirect_uri:  config.redirectUri,
      code,
      code_verifier: verifier,
    })

    const response = await fetch(config.tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`OAuth token exchange failed (${response.status}): ${text}`)
    }

    const data = await response.json() as {
      access_token:  string
      refresh_token: string | undefined
      expires_in:    number
      scope?:        string
    }

    await this.storeToken(llmProviderId, data)
  }

  // ── 4. getAccessToken ──────────────────────────────────────────────────────
  // Punto de entrada para el flow-engine.
  // Refresca el token si está próximo a vencer (buffer de 5 min).
  // Usa mutex en memoria para evitar double-refresh concurrente.

  async getAccessToken(llmProviderId: string): Promise<string> {
    const record = await this.prisma.oAuthToken.findUnique({
      where: { llmProviderId },
    })

    if (!record) {
      throw new Error(`No OAuthToken found for LlmProvider ${llmProviderId}. Run OAuth flow first.`)
    }

    const expiresAt = record.expiresAt.getTime()
    const now       = Date.now()

    if (expiresAt > now + OAuthService.REFRESH_BUFFER_MS) {
      // Token vigente — descifrar y retornar
      return decrypt(record.accessTokenEnc)
    }

    // Token vencido o próximo a vencer — refrescar bajo mutex
    return this.refreshWithLock(llmProviderId, record.refreshTokenEnc)
  }

  // ── 5. refreshToken ────────────────────────────────────────────────────────
  // Refresco explícito. Uso interno y para endpoints de admin.

  async refreshToken(llmProviderId: string): Promise<void> {
    const record = await this.prisma.oAuthToken.findUnique({
      where: { llmProviderId },
      include: { llmProvider: true },
    })

    if (!record) throw new Error(`OAuthToken not found for ${llmProviderId}`)
    if (!record.refreshTokenEnc) throw new Error(`No refresh token stored for ${llmProviderId}`)

    const provider = record.llmProvider.provider
    const config   = this.getConfig(provider)

    const refreshToken = decrypt(record.refreshTokenEnc)

    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     config.clientId,
      refresh_token: refreshToken,
    })

    const response = await fetch(config.tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Token refresh failed (${response.status}): ${text}`)
    }

    const data = await response.json() as {
      access_token:  string
      refresh_token: string | undefined
      expires_in:    number
      scope?:        string
    }

    await this.storeToken(llmProviderId, data)
  }

  // ── 6. revokeToken ─────────────────────────────────────────────────────────
  // Elimina el OAuthToken de la DB. El access token en memoria expira solo.

  async revokeToken(llmProviderId: string): Promise<void> {
    await this.prisma.oAuthToken.deleteMany({
      where: { llmProviderId },
    })
    refreshLocks.delete(llmProviderId)
  }

  // ── 7. getTokenStatus ──────────────────────────────────────────────────────
  // Para el endpoint GET /llm-providers/:id/oauth/status

  async getTokenStatus(llmProviderId: string): Promise<{
    hasToken:   boolean
    expiresAt:  Date | null
    accountId:  string | null
    isExpired:  boolean
    expiresInMs: number | null
  }> {
    const record = await this.prisma.oAuthToken.findUnique({
      where: { llmProviderId },
    })

    if (!record) {
      return { hasToken: false, expiresAt: null, accountId: null, isExpired: false, expiresInMs: null }
    }

    const now        = Date.now()
    const expiresMs  = record.expiresAt.getTime()
    return {
      hasToken:    true,
      expiresAt:   record.expiresAt,
      accountId:   record.accountId,
      isExpired:   expiresMs < now,
      expiresInMs: expiresMs - now,
    }
  }

  // ── Privados ──────────────────────────────────────────────────────────────

  private getConfig(provider: string): OAuthProviderConfig {
    const config = OAUTH_CONFIGS[provider]
    if (!config) throw new Error(`No OAuth config for provider "${provider}"`)
    return config
  }

  private async storeToken(
    llmProviderId: string,
    data: {
      access_token:  string
      refresh_token: string | undefined
      expires_in:    number
      scope?:        string
    },
  ): Promise<void> {
    const expiresAt  = new Date(Date.now() + data.expires_in * 1000)
    const accountId  = extractSubFromJwt(data.access_token)

    const payload = {
      accessTokenEnc:  encrypt(data.access_token),
      refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : null,
      expiresAt,
      accountId:       accountId ?? null,
      scopes:          data.scope ?? null,
    }

    await this.prisma.oAuthToken.upsert({
      where:  { llmProviderId },
      update: payload,
      create: { llmProviderId, ...payload },
    })
  }

  private refreshWithLock(
    llmProviderId:    string,
    refreshTokenEnc:  string | null,
  ): Promise<string> {
    // Si ya hay un refresh en vuelo para este provider, reusar la misma promesa
    const existing = refreshLocks.get(llmProviderId)
    if (existing) return existing

    if (!refreshTokenEnc) {
      throw new Error(`Token expired and no refresh token available for ${llmProviderId}`)
    }

    const lock = this.refreshToken(llmProviderId)
      .then(async () => {
        const updated = await this.prisma.oAuthToken.findUnique({
          where: { llmProviderId },
        })
        if (!updated) throw new Error('Token record missing after refresh')
        return decrypt(updated.accessTokenEnc)
      })
      .finally(() => {
        refreshLocks.delete(llmProviderId)
      })

    refreshLocks.set(llmProviderId, lock)
    return lock
  }
}
