/**
 * GET /api/private/reviews/[id] — full review detail with all replies (timeline)
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:read");
    const { id } = await params;
    const review = await reviewService.getById(ctx, id);
    return ok(review);
  } catch (err) {
    return handleError(err);
  }
}
