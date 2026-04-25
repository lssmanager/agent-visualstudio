/**
 * PrismaService — singleton PrismaClient compartido por todos los módulos.
 *
 * Uso:
 *   import { prisma } from '../../core/db/prisma.service';
 *   const agents = await prisma.agent.findMany();
 *
 * La URL de conexión viene exclusivamente de DATABASE_URL en .env.
 * Credenciales de modelos y canales se leen desde la tabla ChannelConfig
 * con su campo `credentials` cifrado, NUNCA desde .env.
 */

// import { PrismaClient } from '../../../../../../../../packages/db/generated/client';
// Commented out: Path does not exist. Using type-only import instead.
import type { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Singleton — reutiliza la misma conexión en hot-reload (dev) y producción
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });
  return client;
}

export const prisma: PrismaClient =
  global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

/**
 * Cierra la conexión de forma limpia al apagar el servidor.
 * Llamar en el handler de SIGTERM/SIGINT del main.ts.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
