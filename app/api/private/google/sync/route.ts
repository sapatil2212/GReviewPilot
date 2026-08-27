/**
 * POST /api/private/google/sync
 * Body (optional): { kind?: "LOCATIONS" | "REVIEWS" | "ACCOUNTS" | "FULL" }
 *
 * Enqueues a sync job and returns immediately (202 semantics via ok payload).
 * Duplicate active jobs are deduped.
 */

import type { NextRequest } from "next/server";
import { SyncKind } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { ConflictError } from "@/server/utils/errors";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z
    .enum(["ACCOUNTS", "LOCATIONS", "REVIEWS", "FULL"])
    .default("LOCATIONS"),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:sync");

    const account = await googleAccountRepository.findConnectedByTenantId(
      ctx.tenantId,
    );
    if (!account) {
      throw new ConflictError(
        "CONFLICT",
        "No Google Business account is connected to this workspace",
      );
    }

    const raw = await req.json().catch(() => ({}));
    const { kind } = bodySchema.parse(raw);
    const syncKind =
      kind === "ACCOUNTS"
        ? SyncKind.ACCOUNTS
        : kind === "REVIEWS"
          ? SyncKind.REVIEWS
          : kind === "FULL"
            ? SyncKind.FULL
            : SyncKind.LOCATIONS;

    const { job, created } = await syncJobService.enqueue({
      tenantId: ctx.tenantId,
      googleAccountId: account.id,
      kind: syncKind,
      triggeredById: ctx.userId,
      priority: syncKind === SyncKind.ACCOUNTS ? 10 : 100,
      delayMs: 100 + Math.floor(Math.random() * 500),
      metadata: { source: "manual" },
    });

    return ok(
      {
        job,
        created,
        message: created
          ? "Sync queued"
          : "A synchronization is already in progress",
      },
      {
        message: created
          ? "Sync queued"
          : "A synchronization is already in progress",
        status: created ? 202 : 200,
      },
    );
  } catch (err) {
    return handleError(err);
  }
}
