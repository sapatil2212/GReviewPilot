/**
 * POST /api/private/sites/[siteId]/ai/generate
 *
 * Build a complete website from a natural-language brief.
 *
 * Rate limited per user rather than per IP: generation is the most expensive
 * operation in the product (a large model call plus a full page rewrite), and
 * a shared office IP must not exhaust the budget for everyone behind it.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteAiService } from "@/server/services/siteAi.service";
import { generateSiteSchema } from "@/server/validators/site.schema";
import { checkRateLimit } from "@/server/middleware/rateLimit";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
// Full-site generation involves a large model call plus a page write per page;
// the default serverless timeout is not enough.
export const maxDuration = 120;

type Params = { params: Promise<{ siteId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:ai");
    const { siteId } = await params;

    // Throws RateLimitError, which handleError maps to a 429 with Retry-After.
    checkRateLimit({
      key: `site-generate:${ctx.userId}`,
      max: 10,
      windowMs: 60 * 60 * 1000,
    });

    const body = await req.json().catch(() => null);
    const input = generateSiteSchema.parse(body);
    const result = await siteAiService.generate(ctx, siteId, input, req);

    return ok(result, { message: "Website generated" });
  } catch (err) {
    return handleError(err);
  }
}
