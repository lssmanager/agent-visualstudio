/**
 * [F3a-01] PrismaModule — módulo global de Prisma
 *
 * @Global() → PrismaService disponible en todos los módulos
 * sin necesidad de importar PrismaModule explícitamente.
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService }  from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports:   [PrismaService],
})
export class PrismaModule {}
