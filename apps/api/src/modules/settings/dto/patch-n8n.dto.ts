import { IsString, IsUrl, MinLength } from 'class-validator'

export class PatchN8nDto {
  @IsUrl()
  baseUrl!: string

  @IsString()
  @MinLength(1)
  apiKey!: string
}
