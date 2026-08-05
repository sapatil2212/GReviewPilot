/**
 * POST   /api/private/reviews/[id]/tags  — add a tag { tagId }
 * DELETE /api/private/reviews/[id]/tags?tagId=... — remove a tag
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { addTagToReviewSchema } from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:tag:manage");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const { tagId } = addTagToReviewSchema.parse(body);
    const link = await reviewService.addTag(ctx, id, tagId, req);
    return ok(link, { message: "Tag added" });
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
    requirePermission(ctx, "review:tag:manage");
    const { id } = await params;
    const url = new URL(req.url);
    const tagId = url.searchParams.get("tagId");
    if (!tagId) {
      return ok(null, { status: 400 });
    }
    const result = await reviewService.removeTag(ctx, id, tagId, req);
    return ok(result, { message: "Tag removed" });
  } catch (err) {
    return handleError(err);
  }
}
