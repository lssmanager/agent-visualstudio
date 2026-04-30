/**
 * [F3a-01] main.ts — NestJS bootstrap del Gateway
 *
 * Puerto: GATEWAY_PORT env (default: 3200)
 *
 * Usa @nestjs/platform-express para mantener compatibilidad
 * con SSE (webchat stream) y los adaptadores de canal existentes
 * que usan API directa de Express req/res.
 *
 * CORS, Helmet, rate limiting se aplican via AppModule.configure()
 * en lugar de applySecurityMiddleware() de Express — el middleware
 * Express existente se usará solo para las rutas legacy en bridge.
 */

import 'reflect-metadata';
import { NestFactory }    from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule }      from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Suprimir logs de arranque de NestJS en production
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['log', 'error', 'warn', 'debug'],
  });

  // Global validation pipe — transforma y valida DTOs automáticamente
  app.useGlobalPipes(new ValidationPipe({
    whitelist:            true,
    forbidNonWhitelisted: false,  // false: no romper payloads de telegram/webchat
    transform:            true,
  }));

  // NOTA: no usar setGlobalPrefix aquí — las rutas legacy ya tienen sus paths
  // correctos montados en createApp() de server.ts a través del bridge.

  const port = Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? 3200);
  await app.listen(port);

  console.info(`[gateway] NestJS process listening on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('[gateway] Fatal startup error:', err);
  process.exit(1);
});
