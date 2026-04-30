import { IsString, MinLength } from 'class-validator'

export class PatchProviderKeyDto {
  @IsString()
  @MinLength(1)
  apiKey!: string
}
