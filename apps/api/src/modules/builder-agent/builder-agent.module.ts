import { Module } from '@nestjs/common';
import { BuilderAgentService } from './builder-agent.service';
import { BuilderAgentController } from './builder-agent.controller';

/**
 * BuilderAgentModule
 *
 * FIXED (2026-05-06): BuilderAgentController estaba importado pero no incluido
 * en `controllers`, causando TS2305 — "has no exported member".
 */
@Module({
  controllers: [BuilderAgentController],
  providers:   [BuilderAgentService],
  exports:     [BuilderAgentService],
})
export class BuilderAgentModule {}
