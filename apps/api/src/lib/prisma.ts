/**
 * apps/api/src/lib/prisma.ts
 *
 * Singleton getPrisma() — Express-compatible (no NestJS DI).
 *
 * Todos los controllers/services que importan
 *   import { getPrisma } from '../../lib/prisma'
 * resuelven aquí.
 *
 * En tests: set process.env.DATABASE_URL antes de importar.
 */

import { PrismaClient } from '@prisma/client'

let _client: PrismaClient | undefined

/**
 * Retorna el singleton PrismaClient.
 * Lo instancia la primera vez (lazy) y lo reutiliza en llamadas posteriores.
 */
export function getPrisma(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      log: process.env['NODE_ENV'] === 'development'
        ? ['warn', 'error']
        : ['error'],
    })
  }
  return _client
}

/**
 * Desconecta el cliente Prisma.
 * Llamar en el shutdown handler (SIGTERM / SIGINT) del servidor.
 */
export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect()
    _client = undefined
  }
}
