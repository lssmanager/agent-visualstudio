import { Module }                  from '@nestjs/common'
import { ChannelsController }      from './channels.controller.js'
import { ChannelLifecycleService } from './channel-lifecycle.service.js'
import { ChannelEventEmitter }     from './channel-event-emitter.js'
import { GatewayModule }           from '../gateway/gateway.module.js'

@Module({
  imports:     [GatewayModule],
  controllers: [ChannelsController],
  providers:   [ChannelLifecycleService, ChannelEventEmitter],
  exports:     [ChannelLifecycleService, ChannelEventEmitter],
})
export class ChannelsModule {}
