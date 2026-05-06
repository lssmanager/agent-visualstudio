import { Module } from '@nestjs/common'

import { AgentResolverService } from './agent-resolver.service'
import { GatewayService } from './gateway.service'

@Module({
  providers: [GatewayService, AgentResolverService],
  exports: [GatewayService, AgentResolverService],
})
export class GatewayModule {}
