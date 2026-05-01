import { Module } from '@nestjs/common';

import { GatewayService } from './gateway.service';
import { AgentResolverService } from './agent-resolver.service';

@Module({
  providers: [GatewayService, AgentResolverService],
  exports: [GatewayService, AgentResolverService],
})
export class GatewayModule {}
