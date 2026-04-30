/**
 * [F3a-01] AppModule — Módulo raíz del Gateway NestJS
 *
 * Arquitectura de módulos:
 *   AppModule
 *     ├─ PrismaModule          (PrismaService global)
 *     ├─ GatewayModule         (GatewayService, HealthController)
 *     └─ bridge Express routes (montadas en onModuleInit, temporal)
 *
 * Bridge pattern:
 *   NestFactory crea la app NestJS pero el httpAdapter subyacente
 *   sigue siendo Express. En onModuleInit() montamos las rutas Express
 *   existentes (telegram, webchat, channels) sobre ese adapter.
 *   Esto permite que F3a-01 no rompa producción.
 *   F3a-02 y F3a-03 reemplazarán cada router por un NestJS Controller
 *   y eliminarán el bridge.
 */

import {
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Application } from 'express';
import { PrismaModule }    from './prisma/prisma.module';
import { GatewayModule }   from './gateway.module';
import { PrismaService }   from './prisma/prisma.service';

// Legacy Express app factory (bridge — eliminar en F3a-02/03)
import { createApp } from './server';

@Module({
  imports: [
    PrismaModule,
    GatewayModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly prisma:          PrismaService,
  ) {}

  /**
   * Bridge: monta las rutas Express legacy sobre el httpAdapter.
   *
   * createApp({ db: this.prisma }) reutiliza el PrismaService del DI
   * en lugar de crear un nuevo PrismaClient.
   *
   * Las rutas se montan en '/' porque createApp() ya define los
   * paths completos (/gateway/telegram, /api/channels, etc.).
   *
   * TODO(F3a-02): eliminar webchat routes del bridge cuando
   *               WebchatController esté implementado.
   * TODO(F3a-03): eliminar telegram routes del bridge cuando
   *               TelegramController esté implementado.
   */
  onModuleInit(): void {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    const expressApp  = httpAdapter.getInstance<Application>();

    // Crear la Express app legacy con el PrismaService del DI
    // PrismaService extiende PrismaClient — compatible 1:1 con AppOptions.db
    const legacyApp = createApp({ db: this.prisma });

    // Montar todos los handlers de la app legacy en el Express subyacente.
    // NestJS registra sus propios handlers ANTES (mayor prioridad para /health).
    expressApp.use(legacyApp);

    console.info('[AppModule] Legacy Express routes mounted (bridge pattern)');
  }
}
