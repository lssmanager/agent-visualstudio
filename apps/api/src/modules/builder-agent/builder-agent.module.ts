/**
 * builder-agent.module.ts
 *
 * Módulo NestJS para el AgentBuilder.
 * Registra BuilderAgentService, N8nStudioHelper y ProfilePropagatorService.
 *
 * Nota: N8nService NO es @Injectable() — es clase plain instanciada
 * directamente dentro de N8nStudioHelper. No se importa N8nModule.
 * PrismaService es @Global() — disponible sin importar PrismaModule aquí.
 *
 * Issue: #76 (F4b-01)
 */

import { Module }                   from '@nestjs/common';
import { BuilderAgentService }      from './builder-agent.service';
import { N8nStudioHelper }          from './n8n-studio-helper';
import { ProfilePropagatorService } from './profile-propagator.service';

@Module({
  providers: [
    BuilderAgentService,
    N8nStudioHelper,
    ProfilePropagatorService,
  ],
  exports: [
    BuilderAgentService,
    N8nStudioHelper,
  ],
})
export class BuilderAgentModule {}
