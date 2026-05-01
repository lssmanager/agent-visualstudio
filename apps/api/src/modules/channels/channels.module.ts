import { Module }                    from '@nestjs/common'
import { ChannelsController }        from './channels.controller.js'
import { ChannelLifecycleService }   from './channel-lifecycle.service.js'
import { GatewayModule }             from '../gateway/gateway.module.js'

@Module({
  imports:     [GatewayModule],   // provee GatewayService + AgentResolverService
  controllers: [ChannelsController],
  providers:   [ChannelLifecycleService],
  exports:     [ChannelLifecycleService],
})
export class ChannelsModule {}
