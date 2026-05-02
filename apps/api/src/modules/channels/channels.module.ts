/**
 * channels.module.ts — actualizado F3a-32
 *
 * Registra ChannelBindingService y ChannelBindingController.
 */

import { Module }                    from '@nestjs/common';
import { ChannelsService }           from './channels.service';
import { ChannelsController }        from './channels.controller';
import { ChannelLifecycleService }   from './channel-lifecycle.service';
import { ChannelBindingService }     from './channel-binding.service';
import { ChannelBindingController }  from './channel-binding.controller';

@Module({
  controllers: [
    ChannelsController,
    ChannelBindingController,
  ],
  providers: [
    ChannelsService,
    ChannelLifecycleService,
    ChannelBindingService,
  ],
  exports: [
    ChannelsService,
    ChannelLifecycleService,
    ChannelBindingService,
  ],
})
export class ChannelsModule {}
