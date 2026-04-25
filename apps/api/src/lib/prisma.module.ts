import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — global: true significa que PrismaService está disponible
 * en cualquier módulo sin necesidad de importarlo individualmente.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports:   [PrismaService],
})
export class PrismaModule {}
