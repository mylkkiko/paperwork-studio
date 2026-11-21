import type { Prisma } from '@prisma/client';
import type { Deps } from '../deps';

/** Append-only audit trail: who did what to which entity, and when. */
export class AuditService {
  constructor(private readonly d: Pick<Deps, 'prisma' | 'clock'>) {}

  async log(actorId: string | null | undefined, action: string, entityType: string, entityId: string, meta: Record<string, unknown> = {}) {
    await this.d.prisma.auditLog.create({
      data: { actorId: actorId ?? null, action, entityType, entityId, meta: meta as Prisma.InputJsonValue, createdAt: this.d.clock.now() },
    });
  }

  async list(filter: { entityType?: string; entityId?: string; limit?: number }) {
    return this.d.prisma.auditLog.findMany({
      where: { entityType: filter.entityType, entityId: filter.entityId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 100, 500),
    });
  }
}
