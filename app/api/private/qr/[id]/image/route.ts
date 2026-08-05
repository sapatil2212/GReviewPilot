/**
 * GET /api/private/qr/[id]/image?format=png|svg
 * Returns the QR image encoding the dynamic redirect URL.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { qrCodeService } from "@/server/services/qrCode.service";
import { qrService } from "@/server/services/qr.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "qr:read");
    const { id } = await params;
    const qr = await qrCodeService.getById(ctx, id);
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "png").toLowerCase();

    const opts = {
      dark: qr.darkColor ?? undefined,
      light: qr.lightColor ?? undefined,
    };

    if (format === "svg") {
      const svg = await qrService.toSvg(qr.publicUrl, opts);
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
    const dataUrl = await qrService.toPngDataUrl(qr.publicUrl, {
      ...opts,
      size: 512,
    });
    return ok({ dataUrl, url: qr.publicUrl });
  } catch (err) {
    return handleError(err);
  }
}
