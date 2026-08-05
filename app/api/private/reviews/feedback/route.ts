/**
 * GET /api/private/reviews/feedback
 * List private feedback (low-rating funnel submissions).
 * Query: page, pageSize, search, sortBy, sortDir, status, locationId
 */

import type { NextRequest } from "next/server";
import { FeedbackStatus } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { privateFeedbackRepository } from "@/server/repositories/privateFeedback.repository";
import { buildPagedResult, parsePagination } from "@/server/utils/pagination";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  locationId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:read");
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const filter = querySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
    });
    const { items, total } = await privateFeedbackRepository.list({
      tenantId: ctx.tenantId,
      filter,
      pagination,
    });
    return ok(buildPagedResult(items, total, pagination));
  } catch (err) {
    return handleError(err);
  }
}
