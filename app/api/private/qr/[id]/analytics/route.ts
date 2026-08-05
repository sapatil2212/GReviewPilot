/**
 * GET /api/private/qr/[id]/analytics
 * Scan breakdown: by device, by country, recent scans, daily trend (30d).
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { qrCodeService } from "@/server/services/qrCode.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "qr:read");
    const { id } = await params;
    const data = await qrCodeService.analytics(ctx, id);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
