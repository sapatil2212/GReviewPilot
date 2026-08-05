/**
 * POST /api/private/media/bulk/delete
 * Body: { ids: string[] }  (max 200)
 *
 * Soft-deletes many assets in one call.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { mediaService } from "@/server/services/media.service";
import { bulkDeleteSchema } from "@/server/validators/media.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "media:delete");
    const body = await req.json().catch(() => null);
    const input = bulkDeleteSchema.parse(body);
    const result = await mediaService.bulkRemove(ctx, input, req);
    return ok(result, { message: "Media deleted" });
  } catch (err) {
    return handleError(err);
  }
}
