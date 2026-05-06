/**
 * session-manager.ts
 *
 * FIX ROOT 3: Prisma JSON fields require InputJsonValue | NullableJsonNullValueInput.
 * Cast `unknown` metadata to `Prisma.InputJsonValue` before passing to create/update.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export class SessionManager {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(params: {
    id: string;
    workspaceId: string;
    channelKind: string;
    metadata?: unknown;
  }) {
    return this.prisma.session.create({
      data: {
        id:          params.id,
        workspaceId: params.workspaceId,
        channelKind: params.channelKind as any,
        status:      'active',
        // FIX: cast unknown → InputJsonValue
        metadata:    (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updateSessionMetadata(id: string, metadata: unknown) {
    return this.prisma.session.update({
      where: { id },
      data: {
        // FIX: cast unknown → InputJsonValue
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
        lastEventAt: new Date(),
      },
    });
  }

  async closeSession(id: string) {
    return this.prisma.session.update({
      where: { id },
      data: { status: 'closed', lastEventAt: new Date() },
    });
  }

  async findSession(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }
}
