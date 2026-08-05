import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/utils/logger";

export interface AuditEntry {
  action: AuditAction;
  userId?: string | null;
  tenantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  device?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export const auditRepository = {
  /**
   * Best-effort audit write. Never throws to the caller — a failing
   * audit must not break the primary operation.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: entry.action,
          userId: entry.userId ?? null,
          tenantId: entry.tenantId ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          browser: entry.browser ?? null,
          device: entry.device ?? null,
          metadata: entry.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      logger.warn("Audit log write failed", {
        action: entry.action,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
