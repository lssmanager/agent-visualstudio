/**
 * agency-templates.module.ts
 *
 * Módulo NestJS para el catálogo de AgentTemplates provenientes
 * de vendor/agency-agents (msitarzewski/agency-agents submodule).
 *
 * Registra AgencyTemplatesService y lo exporta para que otros módulos
 * (BuilderAgentModule, StudioModule) puedan inyectarlo via DI.
 *
 * Issue: F6b-FX01
 */

import { Module } from '@nestjs/common';
import { AgencyTemplatesService } from './agency-templates.service';

@Module({
  providers: [AgencyTemplatesService],
  exports:   [AgencyTemplatesService],
})
export class AgencyTemplatesModule {}
