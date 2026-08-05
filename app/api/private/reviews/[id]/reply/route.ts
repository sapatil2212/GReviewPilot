/**
 * POST /api/private/reviews/[id]/reply — add reply (soft-deletes prior)
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { replySchema } from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:reply");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = replySchema.parse(body);
    const reply = await reviewService.reply(ctx, id, input, req);
    return ok(reply, { message: "Reply sent", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
