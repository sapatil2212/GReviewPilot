/**
 * POST /api/private/google/quick-connect
 * Body: { input, mode: "new"|"existing", locationId?, name?, city?, country? }
 *
 * The non-OAuth connection path. Resolves a Place ID from a Maps URL
 * or raw ID and attaches it to a new or existing location, enabling
 * the AI review funnel immediately.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { quickConnectService } from "@/server/services/google/quickConnect.service";
import { quickConnectSchema } from "@/server/validators/google.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:manage");
    const body = await req.json().catch(() => null);
    const input = quickConnectSchema.parse(body);
    const result = await quickConnectService.connect(ctx, input, req);
    return ok(result, { message: "Location connected", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
