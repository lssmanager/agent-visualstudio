import { PrismaClient } from '@prisma/client'

/**
 * Servicio de configuración global del sistema (single-tenant).
 * Lee y escribe en la tabla SystemConfig de la BD.
 * Sin cifrado — mismo nivel de confianza que .env en disco.
 */
export class SystemConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } })
    return row?.value ?? null
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where:  { key },
      update: { value },
      create: { key, value },
    })
  }

  async delete(key: string): Promise<void> {
    await this.prisma.systemConfig.deleteMany({ where: { key } })
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany()
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }
}
