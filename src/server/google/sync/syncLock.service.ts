/**
 * Distributed sync locks (MySQL). TTL-based so crashed workers recover.
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/utils/env";

export function syncLockKey(opts: {
  tenantId: string;
  googleAccountId: string;
  kind?: string;
  googleLocationId?: string | null;
}): string {
  return [
    opts.tenantId,
    opts.googleAccountId,
    opts.kind ?? "any",
    opts.googleLocationId ?? "*",
  ].join(":");
}

export const syncLockService = {
  async acquire(lockKey: string, ttlSec = env.GOOGLE_SYNC_LOCK_TTL_SEC) {
    const ownerId = randomBytes(12).toString("hex");
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const now = new Date();

    try {
      // Clear expired locks for this key first.
      await prisma.googleSyncLock.deleteMany({
        where: { lockKey, expiresAt: { lt: now } },
      });

      await prisma.googleSyncLock.create({
        data: { lockKey, ownerId, expiresAt },
      });
      return { acquired: true as const, ownerId, expiresAt };
    } catch {
      return { acquired: false as const, ownerId: null, expiresAt: null };
    }
  },

  async release(lockKey: string, ownerId: string) {
    await prisma.googleSyncLock.deleteMany({
      where: { lockKey, ownerId },
    });
  },

  async heartbeat(lockKey: string, ownerId: string, ttlSec = env.GOOGLE_SYNC_LOCK_TTL_SEC) {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const result = await prisma.googleSyncLock.updateMany({
      where: { lockKey, ownerId },
      data: { expiresAt },
    });
    return result.count > 0;
  },
};
