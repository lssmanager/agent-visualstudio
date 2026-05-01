import { Module }                    from '@nestjs/common'
import { ChannelsController }        from './channels.controller.js'
import { ChannelLifecycleService }   from './channel-lifecycle.service.js'
import { GatewayModule }             from '../gateway/gateway.module.js'
import { PrismaModule }              from '../../lib/prisma.module.js'

@Module({
  imports:     [GatewayModule, PrismaModule],   // provee GatewayService + AgentResolverService + PrismaService
  controllers: [ChannelsController],
  providers:   [ChannelLifecycleService],
  exports:     [ChannelLifecycleService],
})
export class ChannelsModule {}
