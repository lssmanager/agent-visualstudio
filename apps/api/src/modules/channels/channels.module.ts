import { Module } from '@nestjs/common';
import { ChannelsService }    from './channels.service';
import { ChannelsController } from './channels.controller';

/**
 * ChannelsModule — ya no necesita proveer PrismaService porque PrismaModule
 * es @Global() y está disponible globalmente desde que se importa en AppModule.
 */
@Module({
  controllers: [ChannelsController],
  providers:   [ChannelsService],
  exports:     [ChannelsService],   // para que el runtime lo inyecte
})
export class ChannelsModule {}
