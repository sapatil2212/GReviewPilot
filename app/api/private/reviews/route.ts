/**
 * GET  /api/private/reviews   — list reviews (paginated, filterable)
 * POST /api/private/reviews   — create a manual review
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import {
  createManualReviewSchema,
  listReviewsQuerySchema,
} from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:read");
    const url = new URL(req.url);
    const filter = listReviewsQuerySchema.parse({
      locationId: url.searchParams.get("locationId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      sentiment: url.searchParams.get("sentiment") ?? undefined,
      minRating: url.searchParams.get("minRating") ?? undefined,
      maxRating: url.searchParams.get("maxRating") ?? undefined,
      hasReply: url.searchParams.get("hasReply") ?? undefined,
      isArchived: url.searchParams.get("isArchived") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      tagId: url.searchParams.get("tagId") ?? undefined,
    });
    const page = await reviewService.list(ctx, req, filter);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:manage");
    const body = await req.json().catch(() => null);
    const input = createManualReviewSchema.parse(body);
    const review = await reviewService.createManual(ctx, input, req);
    return ok(review, { message: "Review created", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
