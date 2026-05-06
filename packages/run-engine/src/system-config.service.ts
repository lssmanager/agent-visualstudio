// packages/run-engine/src/system-config.service.ts
//
// SystemConfigService — accede al modelo SystemConfig del schema v10.
// Fix 9: SystemConfig.value es Json (JsonValue), no string.
//        Serializar a string si no lo es ya.

import { PrismaClient } from '@prisma/client'

export class SystemConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Obtiene el valor de una clave como string.
   * Si el valor almacenado no es string, lo serializa con JSON.stringify.
   */
  async get(key: string): Promise<string | null> {
    const config = await this.prisma.systemConfig.findUnique({ where: { key } })
    if (!config) return null
    // Fix: value es JsonValue — coercionar a string
    return typeof config.value === 'string'
      ? config.value
      : JSON.stringify(config.value)
  }

  /**
   * Establece el valor de una clave.
   * Acepta string directamente — se almacena como Json.
   */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where:  { key },
      update: { value: value as never },
      create: { key, value: value as never },
    })
  }

  /**
   * Retorna todas las configs como Record<string, string>.
   * Los valores no-string se serializan con JSON.stringify.
   */
  async getAll(): Promise<Record<string, string>> {
    const configs = await this.prisma.systemConfig.findMany()
    return Object.fromEntries(
      configs.map(r => [
        r.key,
        typeof r.value === 'string' ? r.value : JSON.stringify(r.value),
      ])
    )
  }

  /** Elimina una clave de configuración. */
  async delete(key: string): Promise<void> {
    await this.prisma.systemConfig.delete({ where: { key } }).catch(() => {})
  }
}
