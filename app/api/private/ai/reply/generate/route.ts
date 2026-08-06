/**
 * POST /api/private/ai/reply/generate
 *
 * Draft a reply for a real review and persist it as an AiReplyDraft. The
 * returned status reflects the tenant's approval mode, so the caller does not
 * decide whether the reply may be sent — the engine does.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { aiReplyEngineService } from "@/server/services/aiReplyEngine.service";
import { generateDraftSchema } from "@/server/validators/ai.schema";
import { checkRateLimit } from "@/server/middleware/rateLimit";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:reply:generate");

    // Per user, not per IP: a shared office address must not exhaust the
    // allowance for everyone behind it.
    checkRateLimit({
      key: `ai-reply-generate:${ctx.userId}`,
      max: 120,
      windowMs: 60 * 60 * 1000,
    });

    const body = await req.json().catch(() => null);
    const input = generateDraftSchema.parse(body);
    const draft = await aiReplyEngineService.generateForReview(ctx, input, req);

    return ok(draft, { message: "Draft ready", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
