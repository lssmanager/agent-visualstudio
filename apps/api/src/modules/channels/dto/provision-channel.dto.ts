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
  status:         string
  isActive:       boolean
  errorMessage:   string | null
  lastStartedAt:  string | null
  lastStoppedAt:  string | null
  bindingCount:   number
  activeSessions: number
  createdAt:      string
  updatedAt:      string
}
