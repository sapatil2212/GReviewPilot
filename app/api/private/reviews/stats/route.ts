/**
 * GET /api/private/reviews/stats
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:read");
    const stats = await reviewService.stats(ctx);
    return ok(stats);
  } catch (err) {
    return handleError(err);
  }
}
