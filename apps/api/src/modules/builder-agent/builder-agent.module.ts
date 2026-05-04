// builder-agent.module.ts
// N8nModule import commented out until feat/phase-F4a-n8n-completo is implemented.
// TODO: uncomment import { N8nModule } from '../n8n/n8n.module'; when F4a lands.

import { BuilderAgentService } from './builder-agent.service';
import { BuilderAgentController } from './builder-agent.controller';

export const BuilderAgentModule = {
  service:    BuilderAgentService,
  controller: BuilderAgentController,
  // n8n: N8nModule,  // TODO: F4a
};
