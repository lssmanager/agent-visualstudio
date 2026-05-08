/**
 * lib/prisma.ts — singleton PrismaClient para apps/gateway
 *
 * Resuelve TS6059: telegram.adapter.ts importaba desde ../../lib/prisma
 * que estaba fuera del rootDir (src/). Este módulo vive dentro de src/lib/
 * y es el único punto de acceso a Prisma en el gateway.
 *
 * En producción se usa el cliente generado por @lss/db (prisma generate).
 * En tests se puede reemplazar con un mock mediante jest.mock('../lib/prisma').
 */

import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | undefined;

/**
 * Retorna la instancia singleton de PrismaClient.
 * Crea una nueva instancia solo si no existe una previa.
 */
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
    });
  }
  return _prisma;
}

/**
 * Desconecta el cliente de Prisma. Llamar en shutdown hooks.
 */
export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = undefined;
  }
}
