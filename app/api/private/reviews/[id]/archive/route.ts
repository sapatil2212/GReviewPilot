/**
 * POST   /api/private/reviews/[id]/archive — archive
 * DELETE /api/private/reviews/[id]/archive — unarchive
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:manage");
    const { id } = await params;
    const review = await reviewService.archive(ctx, id, true, req);
    return ok(review, { message: "Review archived" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:manage");
    const { id } = await params;
    const review = await reviewService.archive(ctx, id, false, req);
    return ok(review, { message: "Review unarchived" });
  } catch (err) {
    return handleError(err);
  }
}
