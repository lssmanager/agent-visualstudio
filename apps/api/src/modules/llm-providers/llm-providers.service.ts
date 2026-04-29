/**
 * LlmProvidersService
 *
 * CRUD de LlmProvider + operaciones de apoyo:
 *   - cifrado/descifrado de apiKeyEnc
 *   - construcción de LlmProvider desde ProviderCatalog
 *   - shortcut getForWorkspace con catalog incluido
 */
import type { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'

// ── Cifrado (mismo helper que OAuthService) ────────────────────────────────

function getKey(): Buffer {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'hex')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  return key
}

export function encryptSecret(plaintext: string): string {
  const key    = getKey()
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptSecret(enc: string): string {
  const [ivHex, tagHex, dataHex] = enc.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted secret format')
  const key      = getKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8')
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateLlmProviderDto {
  provider:   string        // slug FK a ProviderCatalog
  apiKey?:    string        // plano — se cifra al guardar (null si authType=oauth|none)
  baseUrl?:   string
  isDefault?: boolean
}

export interface UpdateLlmProviderDto {
  apiKey?:    string        // si viene, reemplaza el cifrado
  baseUrl?:   string | null
  isDefault?: boolean
}

// ── Helpers de respuesta (no exponer tokens cifrados) ───────────────────

function sanitize(row: Record<string, unknown>) {
  const out = { ...row }
  delete out.apiKeyEnc
  return out
}

// ── Service ────────────────────────────────────────────────────────────────

export class LlmProvidersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.llmProvider.findMany({
      where:   { workspaceId },
      include: { catalog: true, oauthToken: { select: { expiresAt: true, accountId: true, scopes: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => sanitize(r as unknown as Record<string, unknown>))
  }

  async get(workspaceId: string, id: string) {
    const row = await this.prisma.llmProvider.findFirst({
      where:   { id, workspaceId },
      include: { catalog: true, oauthToken: { select: { expiresAt: true, accountId: true, scopes: true } } },
    })
    if (!row) return null
    return sanitize(row as unknown as Record<string, unknown>)
  }

  async create(workspaceId: string, dto: CreateLlmProviderDto) {
    // Verificar que el provider existe en el catálogo
    const catalog = await this.prisma.providerCatalog.findUnique({
      where: { id: dto.provider },
    })
    if (!catalog) throw new Error(`Provider "${dto.provider}" not found in catalog`)

    // Si se marca isDefault, quitar el flag de los demás
    if (dto.isDefault) {
      await this.prisma.llmProvider.updateMany({
        where: { workspaceId },
        data:  { isDefault: false },
      })
    }

    const row = await this.prisma.llmProvider.create({
      data: {
        workspaceId,
        provider:  dto.provider,
        baseUrl:   dto.baseUrl ?? null,
        apiKeyEnc: dto.apiKey ? encryptSecret(dto.apiKey) : null,
        isDefault: dto.isDefault ?? false,
      },
      include: { catalog: true },
    })
    return sanitize(row as unknown as Record<string, unknown>)
  }

  async update(workspaceId: string, id: string, dto: UpdateLlmProviderDto) {
    const existing = await this.prisma.llmProvider.findFirst({ where: { id, workspaceId } })
    if (!existing) return null

    if (dto.isDefault) {
      await this.prisma.llmProvider.updateMany({
        where: { workspaceId },
        data:  { isDefault: false },
      })
    }

    const data: Record<string, unknown> = {}
    if (dto.apiKey !== undefined) data.apiKeyEnc = dto.apiKey ? encryptSecret(dto.apiKey) : null
    if (dto.baseUrl  !== undefined) data.baseUrl  = dto.baseUrl
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault

    const row = await this.prisma.llmProvider.update({
      where:   { id },
      data,
      include: { catalog: true },
    })
    return sanitize(row as unknown as Record<string, unknown>)
  }

  async delete(workspaceId: string, id: string) {
    const existing = await this.prisma.llmProvider.findFirst({ where: { id, workspaceId } })
    if (!existing) return false
    await this.prisma.llmProvider.delete({ where: { id } })
    return true
  }

  /** Catálogo completo — para el selector del frontend */
  async listCatalog() {
    return this.prisma.providerCatalog.findMany({
      where:   { isEnabled: true },
      orderBy: { displayName: 'asc' },
    })
  }
}
