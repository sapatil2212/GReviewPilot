/**
 * POST /api/private/reviews/bulk/reply
 * Body: { reviewIds: string[], comment: string }
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { bulkReplySchema } from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:reply");
    const body = await req.json().catch(() => null);
    const input = bulkReplySchema.parse(body);
    const result = await reviewService.bulkReply(ctx, input, req);
    return ok(result, { message: `Replied to ${result.replied} reviews` });
  } catch (err) {
    return handleError(err);
  }
}
