/**
 * GET /api/private/posts/stats
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { postService } from "@/server/services/post.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "post:read");
    const stats = await postService.stats(ctx);
    return ok(stats);
  } catch (err) {
    return handleError(err);
  }
}
