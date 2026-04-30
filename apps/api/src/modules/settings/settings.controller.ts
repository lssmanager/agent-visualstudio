import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { SettingsService }     from './settings.service'
import { PatchProviderKeyDto }  from './dto/patch-provider-key.dto'
import { PatchN8nDto }          from './dto/patch-n8n.dto'

@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  // ── providers ──────────────────────────────────────────────────────────────

  /** Lista todos los providers con hasKey (sin exponer el valor de la key). */
  @Get('providers')
  listProviders() {
    return this.svc.listProviders()
  }

  /** Guarda la API key del provider en SystemConfig (no en .env). */
  @Patch('providers/:providerId/key')
  @HttpCode(HttpStatus.OK)
  async setProviderKey(
    @Param('providerId') providerId: string,
    @Body() dto: PatchProviderKeyDto,
  ) {
    await this.svc.setProviderKey(providerId, dto.apiKey)
    return { ok: true }
  }

  /** Elimina la key de BD — el sistema vuelve a leer process.env como fallback. */
  @Delete('providers/:providerId/key')
  @HttpCode(HttpStatus.OK)
  async deleteProviderKey(@Param('providerId') providerId: string) {
    await this.svc.deleteProviderKey(providerId)
    return { ok: true }
  }

  /** Valida la key con una llamada real de 1 token. */
  @Post('providers/:providerId/test')
  @HttpCode(HttpStatus.OK)
  testProvider(
    @Param('providerId') providerId: string,
    @Body('modelId') modelId: string,
  ) {
    return this.svc.testProvider(providerId, modelId)
  }

  // ── n8n ────────────────────────────────────────────────────────────────────

  @Get('n8n')
  getN8n() {
    return this.svc.getN8n()
  }

  @Patch('n8n')
  @HttpCode(HttpStatus.OK)
  async setN8n(@Body() dto: PatchN8nDto) {
    await this.svc.setN8n(dto.baseUrl, dto.apiKey)
    return { ok: true }
  }

  @Post('n8n/test')
  @HttpCode(HttpStatus.OK)
  testN8n() {
    return this.svc.testN8n()
  }
}
