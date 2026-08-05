/**
 * GET /api/private/google/sync-runs
 * Paginated history of sync runs (manual + scheduled).
 * Query: page, pageSize, sortBy, sortDir, kind, status
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { syncRunRepository } from "@/server/repositories/syncRun.repository";
import { listSyncRunsQuerySchema } from "@/server/validators/google.schema";
import { buildPagedResult, parsePagination } from "@/server/utils/pagination";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:read");
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const filter = listSyncRunsQuerySchema.parse({
      kind: url.searchParams.get("kind") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    const { items, total } = await syncRunRepository.list({
      tenantId: ctx.tenantId,
      filter,
      pagination,
    });
    return ok(buildPagedResult(items, total, pagination));
  } catch (err) {
    return handleError(err);
  }
}
