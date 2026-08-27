/**
 * Sync job queue on SyncRun rows.
 *
 * Manual sync and OAuth enqueue jobs; the cron worker claims and runs them.
 */

import { Prisma, SyncKind, SyncStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/utils/env";
import { userFacingGoogleMessage } from "@/server/google/gateway/errorClassifier";
import type { GoogleErrorCategory } from "@/server/google/gateway/types";

const ACTIVE: SyncStatus[] = [
  SyncStatus.QUEUED,
  SyncStatus.PENDING,
  SyncStatus.RUNNING,
  SyncStatus.RETRYING,
];

export interface EnqueueSyncInput {
  tenantId: string;
  googleAccountId: string;
  kind: SyncKind;
  triggeredById?: string | null;
  googleLocationId?: string | null;
  priority?: number;
  /** Delay before first attempt (jitter). */
  delayMs?: number;
  metadata?: Prisma.InputJsonValue;
}

export const syncJobService = {
  /**
   * Enqueue a sync job, or return the existing active job for the same
   * tenant + account + kind (duplicate prevention).
   */
  async enqueue(input: EnqueueSyncInput) {
    const existing = await prisma.syncRun.findFirst({
      where: {
        tenantId: input.tenantId,
        googleAccountId: input.googleAccountId,
        kind: input.kind,
        status: { in: ACTIVE },
        ...(input.googleLocationId
          ? { googleLocationId: input.googleLocationId }
          : {}),
      },
      orderBy: { startedAt: "desc" },
    });

    if (existing) {
      return { job: existing, created: false as const };
    }

    const nextRetryAt = new Date(Date.now() + (input.delayMs ?? 0));
    const job = await prisma.syncRun.create({
      data: {
        tenantId: input.tenantId,
        googleAccountId: input.googleAccountId,
        googleLocationId: input.googleLocationId ?? null,
        kind: input.kind,
        status: SyncStatus.QUEUED,
        priority: input.priority ?? 100,
        nextRetryAt,
        triggeredById: input.triggeredById ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });

    return { job, created: true as const };
  },

  async getById(id: string, tenantId?: string) {
    return prisma.syncRun.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
      include: {
        triggeredBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        googleAccount: { select: { id: true, email: true, status: true } },
      },
    });
  },

  async findActiveForTenant(tenantId: string, kind?: SyncKind) {
    return prisma.syncRun.findFirst({
      where: {
        tenantId,
        status: { in: ACTIVE },
        ...(kind ? { kind } : {}),
      },
      orderBy: [{ priority: "asc" }, { startedAt: "desc" }],
    });
  },

  /**
   * Claim due jobs for the worker. Uses a compare-and-set on status.
   */
  async claimDue(limit = env.GOOGLE_SYNC_WORKER_BATCH) {
    const now = new Date();
    const candidates = await prisma.syncRun.findMany({
      where: {
        OR: [
          { status: SyncStatus.QUEUED, nextRetryAt: { lte: now } },
          { status: SyncStatus.QUEUED, nextRetryAt: null },
          { status: SyncStatus.RETRYING, nextRetryAt: { lte: now } },
          { status: SyncStatus.PENDING, nextRetryAt: { lte: now } },
        ],
      },
      orderBy: [{ priority: "asc" }, { nextRetryAt: "asc" }, { startedAt: "asc" }],
      take: limit * 3,
    });

    const claimed = [];
    for (const c of candidates) {
      if (claimed.length >= limit) break;
      const updated = await prisma.syncRun.updateMany({
        where: {
          id: c.id,
          status: { in: [SyncStatus.QUEUED, SyncStatus.RETRYING, SyncStatus.PENDING] },
        },
        data: {
          status: SyncStatus.RUNNING,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
        },
      });
      if (updated.count === 1) {
        const job = await prisma.syncRun.findUnique({ where: { id: c.id } });
        if (job) claimed.push(job);
      }
    }
    return claimed;
  },

  async complete(
    id: string,
    result: {
      status: SyncStatus;
      totalItems?: number;
      itemsProcessed: number;
      itemsCreated: number;
      itemsUpdated: number;
      itemsFailed: number;
      errorMessage?: string | null;
      lastErrorCode?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return prisma.syncRun.update({
      where: { id },
      data: {
        status: result.status,
        finishedAt: new Date(),
        totalItems: result.totalItems,
        itemsProcessed: result.itemsProcessed,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsFailed: result.itemsFailed,
        errorMessage: result.errorMessage ?? null,
        lastErrorCode: result.lastErrorCode ?? null,
        ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
      },
    });
  },

  async scheduleRetry(
    id: string,
    opts: {
      category: GoogleErrorCategory | string;
      message: string;
      attemptCount: number;
    },
  ) {
    const maxAttempts = env.GOOGLE_RETRY_LIMIT;
    if (opts.attemptCount >= maxAttempts) {
      return this.complete(id, {
        status: SyncStatus.FAILED,
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        lastErrorCode: String(opts.category),
        errorMessage: userFacingGoogleMessage(
          opts.category as GoogleErrorCategory,
        ),
      });
    }

    const base = env.GOOGLE_BACKOFF_BASE_MS;
    const max = env.GOOGLE_BACKOFF_MAX_MS;
    const jitter = 1 + (Math.random() * 0.4 - 0.2);
    const wait = Math.min(
      max,
      Math.round(base * Math.pow(2, Math.max(0, opts.attemptCount - 1)) * jitter),
    );

    return prisma.syncRun.update({
      where: { id },
      data: {
        status: SyncStatus.RETRYING,
        nextRetryAt: new Date(Date.now() + wait),
        lastErrorCode: String(opts.category),
        errorMessage: userFacingGoogleMessage(
          opts.category as GoogleErrorCategory,
        ),
      },
    });
  },

  async queueDepth() {
    return prisma.syncRun.count({
      where: { status: { in: [SyncStatus.QUEUED, SyncStatus.RETRYING] } },
    });
  },

  async recentFailures(limit = 20) {
    return prisma.syncRun.findMany({
      where: { status: SyncStatus.FAILED },
      orderBy: { finishedAt: "desc" },
      take: limit,
      select: {
        id: true,
        tenantId: true,
        kind: true,
        lastErrorCode: true,
        errorMessage: true,
        finishedAt: true,
      },
    });
  },
};
