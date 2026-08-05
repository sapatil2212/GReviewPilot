/**
 * POST /api/private/google/sync/locations
 * Trigger a location sync from Google Business Profile.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleLocationSyncService } from "@/server/services/google/googleLocationSync.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:sync");
    const run = await googleLocationSyncService.runFor(ctx, req);
    return ok(run, { message: "Location sync complete" });
  } catch (err) {
    return handleError(err);
  }
}
