/**
 * GET  /api/private/qr   — list QR codes (paginated, filterable)
 * POST /api/private/qr   — create a QR code
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { qrCodeService } from "@/server/services/qrCode.service";
import { createQrSchema, listQrQuerySchema } from "@/server/validators/qr.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "qr:read");
    const url = new URL(req.url);
    const filter = listQrQuerySchema.parse({
      type: url.searchParams.get("type") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
    });
    const page = await qrCodeService.list(ctx, req, filter);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "qr:manage");
    const body = await req.json().catch(() => null);
    const input = createQrSchema.parse(body);
    const qr = await qrCodeService.create(ctx, input, req);
    return ok(qr, { message: "QR code created", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
