/**
 * POST /api/private/sites/[siteId]/ai/edit — conversational edit
 * GET  /api/private/sites/[siteId]/ai/edit — conversation transcript
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteAiService } from "@/server/services/siteAi.service";
import { aiEditSchema } from "@/server/validators/site.schema";
import { checkRateLimit } from "@/server/middleware/rateLimit";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ siteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");
    const { siteId } = await params;

    const conversationId = new URL(req.url).searchParams.get("conversationId") ?? undefined;
    return ok(await siteAiService.listMessages(ctx, siteId, conversationId));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:ai");
    const { siteId } = await params;

    // Higher than generation: edits are small, and iterating quickly in
    // conversation is the whole point of the feature.
    checkRateLimit({ key: `site-edit:${ctx.userId}`, max: 60, windowMs: 60 * 60 * 1000 });

    const body = await req.json().catch(() => null);
    const input = aiEditSchema.parse(body);
    const result = await siteAiService.edit(ctx, siteId, input, req);

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
