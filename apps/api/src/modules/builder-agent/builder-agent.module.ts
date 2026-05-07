/**
 * builder-agent module barrel
 *
 * This module uses Express routing, not NestJS controllers.
 * Route registration is done via registerBuilderAgentRoutes() in the router setup.
 */

export { BuilderAgentService } from './builder-agent.service';
export { registerBuilderAgentRoutes } from './builder-agent.controller';
