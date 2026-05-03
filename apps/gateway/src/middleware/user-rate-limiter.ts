/**
 * [F3b-04] user-rate-limiter.ts
 *
 * Rate limiter por canal + externalUserId (senderId).
 * Sliding window en memoria con Map.
 * Para multi-instancia → Redis (F4b).
 *
 * Límite configurable via env:
 *   USER_RATE_LIMIT_MAX=60           (default: 60)
 *   USER_RATE_LIMIT_WINDOW_MS=60000  (default: 60000 = 1 min)
 */

interface Bucket {
  count:   number
  resetAt: number  // timestamp Unix ms
}

const buckets = new Map<string, Bucket>()

function getConfig() {
  return {
    max:      parseInt(process.env['USER_RATE_LIMIT_MAX']       ?? '60',    10),
    windowMs: parseInt(process.env['USER_RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
  }
}

// Limpieza periódica — evita memory leak en instancias de larga vida.
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}, 120_000).unref()

// ── Tipos públicos ──────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:   boolean
  remaining: number
  resetAt:   number
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Comprueba y actualiza el bucket del usuario en la ventana actual.
 *
 * @param channelConfigId - UUID del ChannelConfig
 * @param externalUserId  - ID externo del usuario
 * @returns RateLimitResult con allowed, remaining y resetAt
 */
export function checkUserRateLimit(
  channelConfigId: string,
  externalUserId:  string,
): RateLimitResult {
  const { max, windowMs } = getConfig()
  const key = `${channelConfigId}:${externalUserId}`
  const now = Date.now()

  let bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, bucket)
    return { allowed: true, remaining: max - 1, resetAt: bucket.resetAt }
  }

  if (bucket.count >= max) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
  }

  bucket.count += 1
  return { allowed: true, remaining: max - bucket.count, resetAt: bucket.resetAt }
}

/**
 * Limpia el bucket de un usuario — útil en tests y reseteos administrativos.
 */
export function clearUserBucket(
  channelConfigId: string,
  externalUserId:  string,
): void {
  buckets.delete(`${channelConfigId}:${externalUserId}`)
}

/**
 * Devuelve el número actual de buckets activos en memoria.
 */
export function getRateLimiterSize(): number {
  return buckets.size
}
