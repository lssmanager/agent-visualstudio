import { Module } from '@nestjs/common'

import { AgentResolverService } from './agent-resolver.service.js'
import { GatewayService } from './gateway.service.js'

@Module({
  providers: [GatewayService, AgentResolverService],
  exports: [GatewayService, AgentResolverService],
})
export class GatewayModule {}
