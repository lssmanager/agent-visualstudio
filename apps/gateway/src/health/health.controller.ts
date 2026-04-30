/**
 * [F3a-01] HealthController — GET /health
 *
 * Liveness probe para Coolify / Docker healthcheck.
 * Este endpoint es el único Controller NestJS "nativo" en F3a-01.
 * Su presencia verifica que el DI de NestJS funciona correctamente.
 *
 * IMPORTANTE: NestJS registra sus routes ANTES de que Express maneje
 * el request — el Controller /health tiene prioridad sobre la ruta
 * /health de la Express legacy app (si existe).
 */

import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  ok:      boolean;
  service: string;
  ts:      string;
  runtime: 'nestjs';
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      ok:      true,
      service: 'gateway',
      ts:      new Date().toISOString(),
      runtime: 'nestjs',
    };
  }
}
