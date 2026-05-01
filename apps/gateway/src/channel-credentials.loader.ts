/**
 * Descifra las credenciales de un ChannelConfig en runtime.
 * Usado por los adapters al inicializarse (TelegramAdapter, etc.)
 *
 * Incluye caché en memoria para no descifrar en cada mensaje.
 * El caché se invalida cuando el ChannelConfig es actualizado
 * (llamar invalidateCredentialsCache(channelConfigId) desde el handler PATCH).
 */

import type { PrismaClient }                        from '@prisma/client'
import { ChannelType }                              from '@prisma/client'
import { decryptSecrets, parseCredentials }         from '@lss/crypto'
import type { CredentialsByType }                   from '@lss/crypto'

type CacheEntry = { data: Record<string, unknown>; cachedAt: number }
const CACHE_TTL_MS = 5 * 60 * 1_000  // 5 minutos

const credentialsCache = new Map<string, CacheEntry>()

/**
 * Carga y descifra las credenciales de un ChannelConfig.
 * Tipado genérico: el caller pasa el ChannelType esperado y obtiene
 * el tipo correcto de credenciales.
 *
 * @example
 *   const creds = await loadCredentials(db, configId, ChannelType.telegram)
 *   creds.botToken  // string — tipado correcto
 */
export async function loadCredentials<T extends ChannelType>(
  db:              PrismaClient,
  channelConfigId: string,
  expectedType:    T,
): Promise<CredentialsByType[T]> {
  // 1. Revisar caché
  const cached = credentialsCache.get(channelConfigId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return parseCredentials(expectedType, cached.data)
  }

  // 2. Cargar desde DB
  const config = await db.channelConfig.findUniqueOrThrow({
    where:  { id: channelConfigId },
    select: { secretsEncrypted: true, type: true },
  })

  if (config.type !== expectedType) {
    throw new Error(
      `[credentials] Channel ${channelConfigId} has type ${config.type}, ` +
      `but expected ${expectedType}`
    )
  }

  // 3. Descifrar
  const raw = decryptSecrets(config.secretsEncrypted)

  // 4. Guardar en caché
  credentialsCache.set(channelConfigId, { data: raw, cachedAt: Date.now() })

  // 5. Validar con Zod (lanza si el ciphertext está corrompido o migrado mal)
  return parseCredentials(expectedType, raw)
}

/**
 * Invalida la entrada de caché para un canal.
 * Llamar tras actualizar credenciales via PATCH /channels/:id.
 */
export function invalidateCredentialsCache(channelConfigId: string): void {
  credentialsCache.delete(channelConfigId)
}

/**
 * Limpia todo el caché.
 * Usar solo en tests o tras rotación masiva de clave.
 */
export function clearCredentialsCache(): void {
  credentialsCache.clear()
}
