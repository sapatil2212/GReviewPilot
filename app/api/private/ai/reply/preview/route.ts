/**
 * POST /api/private/ai/reply/preview
 *
 * Draft a reply to a hypothetical review without persisting anything. This is
 * the testing surface for the onboarding wizard: a business can see how its
 * answers behave before it has any real reviews, which is exactly when it is
 * configuring them.
 *
 * Rate limited per user because it is an unauthenticated-adjacent generate
 * endpoint in cost terms — cheap today with the deterministic composer, but the
 * same route once a provider is registered.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { aiReplyEngineService } from "@/server/services/aiReplyEngine.service";
import { previewReplySchema } from "@/server/validators/ai.schema";
import { checkRateLimit } from "@/server/middleware/rateLimit";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ai:reply:generate");

    checkRateLimit({
      key: `ai-reply-preview:${ctx.userId}`,
      max: 60,
      windowMs: 10 * 60 * 1000,
    });

    const body = await req.json().catch(() => null);
    const input = previewReplySchema.parse(body);
    const draft = await aiReplyEngineService.preview(ctx, input);

    return ok(draft);
  } catch (err) {
    return handleError(err);
  }
}
