/**
 * [F3a-01] GatewayModule — Feature module del Gateway
 *
 * Agrupa:
 *   - GatewayService (lógica de dispatch, session, encryption)
 *   - HealthController (GET /health — liveness probe)
 *
 * Cuando F3a-02/03 implementen los Controllers de canal,
 * se añadirán aquí: TelegramController, WebchatController.
 */

import { Module }           from '@nestjs/common';
import { GatewayService }   from './gateway.service';
import { HealthController } from './health/health.controller';
import { PrismaModule }     from './prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  providers:   [GatewayService],
  controllers: [HealthController],
  exports:     [GatewayService],
})
export class GatewayModule {}
