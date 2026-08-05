/**
 * GET /api/private/google/status
 * Connection state, account info, and last-sync timestamp/error.
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:read");
    const status = await googleAccountService.getStatus(ctx);
    return ok(status);
  } catch (err) {
    return handleError(err);
  }
}
