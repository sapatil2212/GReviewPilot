/**
 * POST /api/private/google/quick-connect/[locationId]/disconnect
 *
 * Clears the Quick Connect Place ID from a location (unlink only —
 * the location row is kept).
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { quickConnectService } from "@/server/services/google/quickConnect.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:manage");
    const { locationId } = await params;
    const result = await quickConnectService.disconnect(ctx, locationId, req);
    return ok(result, { message: "Quick Connect location disconnected" });
  } catch (err) {
    return handleError(err);
  }
}
