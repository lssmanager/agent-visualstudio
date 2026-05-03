/**
 * builder-agent.module.ts
 *
 * Módulo NestJS para el AgentBuilder.
 * Registra BuilderAgentService, N8nStudioHelper y ProfilePropagatorService.
 * Importa N8nModule para que N8nService esté disponible como dependencia.
 *
 * Issue: #76 (F4b-01)
 */

import { Module }                    from '@nestjs/common';
import { BuilderAgentService }       from './builder-agent.service';
import { N8nStudioHelper }           from './n8n-studio-helper';
import { ProfilePropagatorService }  from './profile-propagator.service';
import { N8nModule }                 from '../n8n/n8n.module';

@Module({
  imports: [
    N8nModule,
  ],
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
