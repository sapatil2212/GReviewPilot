/**
 * POST /api/private/reviews/bulk/archive
 * Body: { reviewIds: string[], archive: boolean }
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewService } from "@/server/services/review.service";
import { bulkArchiveSchema } from "@/server/validators/review.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:manage");
    const body = await req.json().catch(() => null);
    const input = bulkArchiveSchema.parse(body);
    const result = await reviewService.bulkArchive(ctx, input, req);
    return ok(result, {
      message: result.archive
        ? `Archived ${result.affected} reviews`
        : `Unarchived ${result.affected} reviews`,
    });
  } catch (err) {
    return handleError(err);
  }
}
