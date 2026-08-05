/**
 * GET /api/private/google/locations
 * List every Google location we've mirrored for the caller's tenant,
 * with linkage info to our internal Location model.
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleLocationSyncService } from "@/server/services/google/googleLocationSync.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:read");
    const items = await googleLocationSyncService.listSynced(ctx);
    return ok({ items, total: items.length });
  } catch (err) {
    return handleError(err);
  }
}
