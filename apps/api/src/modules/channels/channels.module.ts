import { Module }                  from '@nestjs/common'
import { ChannelsController }      from './channels.controller.js'
import { ChannelLifecycleService } from './channel-lifecycle.service.js'
import { ChannelEventEmitter }     from './channel-event-emitter.js'
import { GatewayModule }           from '../gateway/gateway.module.js'
import { PrismaModule }            from '../../lib/prisma.module.js'

@Module({
  imports:     [GatewayModule, PrismaModule],
  controllers: [ChannelsController],
  providers:   [ChannelLifecycleService, ChannelEventEmitter],
  exports:     [ChannelLifecycleService, ChannelEventEmitter],
})
export class ChannelsModule {}
