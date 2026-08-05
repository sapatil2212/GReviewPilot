/**
 * PATCH  /api/private/reviews/[id]/reply/[replyId] — edit reply text
 * DELETE /api/private/reviews/[id]/reply/[replyId] — soft-delete reply
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { editReplySchema } from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; replyId: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:reply");
    const { id, replyId } = await params;
    const body = await req.json().catch(() => null);
    const { comment } = editReplySchema.parse(body);
    const reply = await reviewService.editReply(ctx, id, replyId, comment, req);
    return ok(reply, { message: "Reply updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; replyId: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:reply");
    const { id, replyId } = await params;
    const result = await reviewService.deleteReply(ctx, id, replyId, req);
    return ok(result, { message: "Reply deleted" });
  } catch (err) {
    return handleError(err);
  }
}
