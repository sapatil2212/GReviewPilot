/**
 * GET /api/private/qr/stats — tenant-wide QR totals.
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { qrCodeService } from "@/server/services/qrCode.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "qr:read");
    const stats = await qrCodeService.stats(ctx);
    return ok(stats);
  } catch (err) {
    return handleError(err);
  }
}
