/**
 * PUT /api/private/locations/[id]/hours — replace the location's weekly working hours
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationService } from "@/server/services/location.service";
import { updateWorkingHoursSchema } from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:update");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const { workingHours } = updateWorkingHoursSchema.parse(body);
    const data = await locationService.updateWorkingHours(
      ctx,
      id,
      workingHours,
      req,
    );
    return ok(data, { message: "Working hours updated" });
  } catch (err) {
    return handleError(err);
  }
}
