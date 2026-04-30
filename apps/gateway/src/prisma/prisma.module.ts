import { Global, Module } from '@nestjs/common';
import { PrismaService }  from './prisma.service';

/**
 * @Global() → PrismaService disponible en todos los módulos
 * sin necesidad de importar PrismaModule explícitamente.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports:   [PrismaService],
})
export class PrismaModule {}
