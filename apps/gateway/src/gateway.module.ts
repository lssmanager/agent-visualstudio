import { Module }         from '@nestjs/common';
import { GatewayService } from './gateway.service';
import { PrismaService }  from './prisma/prisma.service';
import { ChannelRouter }  from './channel-router.service'; // [F3a-08]

@Module({
  providers: [
    PrismaService,
    ChannelRouter,  // [F3a-08] proveido aquí para inyección futura en controladores
    GatewayService,
  ],
  exports: [
    GatewayService,
    ChannelRouter,  // [F3a-08] exportado para uso en health/admin endpoints
  ],
})
export class GatewayModule {}
