/**
 * POST /api/private/reviews/analyze-sentiment
 *
 * Backfills sentiment for reviews that don't have it yet. Processes a
 * capped batch per call so the request stays within timeout limits —
 * the client can call repeatedly while `remaining > 0`.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { backfillSentiment } from "@/server/services/sentiment.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(25),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:manage");
    const { limit } = schema.parse((await req.json().catch(() => null)) ?? {});

    const result = await backfillSentiment(ctx.tenantId, limit);
    return ok(result, {
      message:
        result.analyzed > 0
          ? `Analyzed ${result.analyzed} review${result.analyzed === 1 ? "" : "s"}`
          : "Nothing left to analyze",
    });
  } catch (err) {
    return handleError(err);
  }
}
