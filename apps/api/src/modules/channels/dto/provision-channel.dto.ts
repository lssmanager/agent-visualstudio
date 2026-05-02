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
  secrets?: Record<string, unknown> // Secretos — se encriptan antes de guardar

  @IsBoolean()
  @IsOptional()
  autoStart?: boolean   // Si true: provision() + start() en una llamada
}

export class ChannelStatusDto {
  id:             string
  name:           string
  type:           string
  /** Derivado de isActive: 'active' | 'stopped'. AUDIT-25 añadirá enum persistido. */
  status:         string | null
  isActive:       boolean
  /** No persiste en BD hasta AUDIT-25. Siempre null por ahora. */
  errorMessage:   string | null
  /** No persiste en BD hasta AUDIT-25. Siempre null por ahora. */
  lastStartedAt:  string | null
  /** No persiste en BD hasta AUDIT-25. Siempre null por ahora. */
  lastStoppedAt:  string | null
  bindingCount:   number
  activeSessions: number
  createdAt:      string
  updatedAt:      string
}
