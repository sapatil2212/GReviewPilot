/**
 * POST /api/private/locations/[id]/restore — restore an archived or deleted location
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationService } from "@/server/services/location.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:archive"); // restore mirrors archive permission
    const { id } = await params;
    const data = await locationService.restore(ctx, id, req);
    return ok(data, { message: "Location restored" });
  } catch (err) {
    return handleError(err);
  }
}
