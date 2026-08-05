/**
 * POST /api/private/google/quick-connect/preview
 * Body: { input: string }  — Maps URL or Place ID
 *
 * Resolves + (if Places API configured) verifies the Place ID without
 * persisting anything. Used to show the business name/address before
 * the user confirms.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { quickConnectService } from "@/server/services/google/quickConnect.service";
import { previewPlaceSchema } from "@/server/validators/google.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:manage");
    const body = await req.json().catch(() => null);
    const { input } = previewPlaceSchema.parse(body);
    const resolved = await quickConnectService.preview(input);
    return ok(resolved);
  } catch (err) {
    return handleError(err);
  }
}
