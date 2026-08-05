/**
 * DELETE /api/private/reviews/tags/[id] — delete tag (unlinks from all reviews)
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:tag:manage");
    const { id } = await params;
    const result = await reviewService.deleteTag(ctx, id);
    return ok(result, { message: "Tag deleted" });
  } catch (err) {
    return handleError(err);
  }
}
