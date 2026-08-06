/**
 * GET /api/private/ai/reply/drafts — list generated drafts
 *
 * Doubles as the approval queue: filter by PENDING_APPROVAL to get everything
 * waiting on a human.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { aiReplyEngineService } from "@/server/services/aiReplyEngine.service";
import { listDraftsSchema } from "@/server/validators/ai.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:personality:read");

    const params = new URL(req.url).searchParams;
    const input = listDraftsSchema.parse({
      status: params.get("status") ?? undefined,
      reviewId: params.get("reviewId") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });

    return ok(await aiReplyEngineService.listDrafts(ctx, input));
  } catch (err) {
    return handleError(err);
  }
}
