import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

/** Append-only audit trail. Rows are never updated. */
export const auditLogRepository = {
  create(data: {
    deviceId: string | null;
    action: string;
    entity?: string;
    entityId?: string;
    meta?: Prisma.InputJsonValue;
    correlationId?: string;
  }) {
    return prisma.auditLog.create({ data, select: { id: true } });
  },
};
