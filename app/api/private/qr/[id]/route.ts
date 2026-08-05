/**
 * GET    /api/private/qr/[id]  — QR detail
 * PATCH  /api/private/qr/[id]  — update label/target/status/colors/location
 * DELETE /api/private/qr/[id]  — delete
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { qrCodeService } from "@/server/services/qrCode.service";
import { updateQrSchema } from "@/server/validators/qr.schema";
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
    const qr = await qrCodeService.getById(ctx, id);
    return ok(qr);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "qr:manage");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const input = updateQrSchema.parse(body);
    const qr = await qrCodeService.update(ctx, id, input, req);
    return ok(qr, { message: "QR code updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "qr:manage");
    const { id } = await params;
    const result = await qrCodeService.remove(ctx, id, req);
    return ok(result, { message: "QR code deleted" });
  } catch (err) {
    return handleError(err);
  }
}
