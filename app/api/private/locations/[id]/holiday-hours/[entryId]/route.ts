/**
 * PATCH  /api/private/locations/[id]/holiday-hours/[entryId] — update
 * DELETE /api/private/locations/[id]/holiday-hours/[entryId] — remove
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { holidayHoursService } from "@/server/services/holidayHours.service";
import { updateHolidayHoursSchema } from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:update");
    const { id, entryId } = await params;
    const body = await req.json().catch(() => null);
    const input = updateHolidayHoursSchema.parse(body);
    const data = await holidayHoursService.update(ctx, id, entryId, input, req);
    return ok(data, { message: "Holiday hours updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:update");
    const { id, entryId } = await params;
    const data = await holidayHoursService.remove(ctx, id, entryId, req);
    return ok(data, { message: "Holiday hours removed" });
  } catch (err) {
    return handleError(err);
  }
}
