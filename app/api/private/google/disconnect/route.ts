/**
 * POST /api/private/google/disconnect
 * Deletes the GoogleAccount row (and cascades GoogleLocation + SyncRun via schema).
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:manage");
    const result = await googleAccountService.disconnect(ctx, req);
    return ok(result, { message: "Google account disconnected" });
  } catch (err) {
    return handleError(err);
  }
}
