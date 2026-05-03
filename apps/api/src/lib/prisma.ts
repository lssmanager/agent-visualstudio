/**
 * apps/api/src/lib/prisma.ts
 *
 * Re-exports a module-level PrismaClient singleton and a getPrisma() helper
 * so that non-NestJS files (routes, adapters, schedulers) can import Prisma
 * without going through the DI container.
 *
 * Usage:
 *   import { getPrisma, disconnectPrisma } from '../../lib/prisma.js'
 *   const db = getPrisma()
 *   const user = await db.user.findUnique({ where: { id } })
 *
 * NestJS services should inject PrismaService via PrismaModule instead.
 */

import { PrismaClient } from '@prisma/client'

let _prisma: PrismaClient | undefined

/**
 * Returns the module-level PrismaClient singleton.
 * Instantiated lazily on first call; reused on subsequent calls.
 */
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
    })
  }
  return _prisma
}

/**
 * Disconnect the singleton and release the connection pool.
 * Call this in process shutdown hooks.
 */
export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect()
    _prisma = undefined
  }
}

/** Direct reference to the singleton (alias for getPrisma()). */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as Record<string | symbol, unknown>)[prop]
  },
})
