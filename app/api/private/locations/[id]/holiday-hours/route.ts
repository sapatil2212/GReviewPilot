/**
 * GET  /api/private/locations/[id]/holiday-hours   — list entries (optional ?from=&to= in YYYY-MM-DD)
 * POST /api/private/locations/[id]/holiday-hours   — upsert entry for a specific date
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { holidayHoursService } from "@/server/services/holidayHours.service";
import { setHolidayHoursSchema } from "@/server/validators/business.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:read");
    const { id } = await params;
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const data = await holidayHoursService.list(ctx, id, { from, to });
    return ok({ items: data, total: data.length });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:update");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = setHolidayHoursSchema.parse(body);
    const data = await holidayHoursService.set(ctx, id, input, req);
    return ok(data, { message: "Holiday hours saved", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
