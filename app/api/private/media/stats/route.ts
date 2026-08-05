/**
 * GET /api/private/media/stats
 * Returns per-tenant storage usage and per-category breakdown.
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { mediaService } from "@/server/services/media.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "media:read");
    const stats = await mediaService.stats(ctx);
    return ok(stats);
  } catch (err) {
    return handleError(err);
  }
}
