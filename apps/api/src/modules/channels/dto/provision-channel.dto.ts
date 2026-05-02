import { IsString, IsNotEmpty, IsObject, IsOptional, IsBoolean } from 'class-validator'

export class ProvisionChannelDto {
  @IsString()
  @IsNotEmpty()
  type: string          // 'telegram' | 'whatsapp' | 'webchat' | 'slack' | ...

  @IsString()
  @IsNotEmpty()
  name: string          // Nombre legible del canal

  @IsObject()
  config: Record<string, unknown>   // Configuración pública (webhook URL, bot_username…)

  @IsObject()
  @IsOptional()
  secrets?: Record<string, unknown> // Secretos — se encriptan antes de guardar en secretsEncrypted

  @IsBoolean()
  @IsOptional()
  autoStart?: boolean   // Si true: provision() + start() en una llamada
}

/**
 * AUDIT-25: ChannelStatusDto canónico.
 * - errorMessage / lastStartedAt / lastStoppedAt ELIMINADOS (campos fantasma).
 * - isActive es el único campo de estado persistido en ChannelConfig.
 * - status se deriva de isActive en toStatusDto(); puede ser sobreescrito
 *   por RuntimeChannelStatus en memoria si el servicio lo mantiene.
 */
export class ChannelStatusDto {
  id:             string
  name:           string
  type:           string
  /**
   * Derivado de isActive: 'active' | 'stopped'.
   * El servicio puede sobreescribir con RuntimeChannelStatus en memoria
   * para mayor precisión ('starting' | 'stopping' | 'error').
   */
  status:         string
  isActive:       boolean
  bindingCount:   number
  activeSessions: number
  createdAt:      string
  updatedAt:      string
}
