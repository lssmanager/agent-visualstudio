/**
 * [F3a-01] PrismaService — wrapper NestJS sobre PrismaClient.
 *
 * Ciclo de vida:
 *   onModuleInit()    → prisma.$connect()
 *   onModuleDestroy() → prisma.$disconnect()
 *
 * Se registra como global en PrismaModule para que GatewayService
 * y todos los Controllers futuros lo reciban por inyección.
 *
 * Extiende PrismaClient directamente → compatible 1:1 con
 * cualquier código que acepte PrismaClient (incluido createApp()).
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient }                               from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
