/**
 * POST /api/private/ai/reply/drafts/[id] — act on a draft
 *
 * One endpoint for approve / reject / send / discard rather than four, because
 * they are transitions on one state machine and the service must arbitrate
 * between them (a send re-validates, an approve does not).
 *
 * Permission depends on the action. Approving and sending are gated on
 * `ai:reply:approve`, which excludes STAFF — manager approval would be
 * meaningless if the person who generated the draft could wave it through.
 * Discarding your own draft needs no special right.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { aiReplyEngineService } from "@/server/services/aiReplyEngine.service";
import { decideDraftSchema } from "@/server/validators/ai.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const input = decideDraftSchema.parse(body);

    requirePermission(
      ctx,
      input.action === "approve" || input.action === "send"
        ? "ai:reply:approve"
        : "ai:reply:generate",
    );

    const result = await aiReplyEngineService.decide(ctx, id, input, req);

    const message =
      input.action === "send"
        ? "Reply sent"
        : input.action === "approve"
          ? "Draft approved"
          : input.action === "reject"
            ? "Draft rejected"
            : "Draft discarded";

    return ok(result, { message });
  } catch (err) {
    return handleError(err);
  }
}
