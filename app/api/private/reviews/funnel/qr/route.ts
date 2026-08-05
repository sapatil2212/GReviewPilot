/**
 * GET /api/private/reviews/funnel/qr?locationId=<id>&format=png|svg
 *
 * Returns a QR code encoding the public review-funnel URL for a
 * location. PNG returns a data URL (JSON); SVG returns raw SVG markup.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationRepository } from "@/server/repositories/location.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { qrService } from "@/server/services/qr.service";
import { env } from "@/server/utils/env";
import { handleError, ok } from "@/server/utils/response";
import { NotFoundError, ValidationError } from "@/server/utils/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "review:read");

    const url = new URL(req.url);
    const locationId = url.searchParams.get("locationId");
    const format = (url.searchParams.get("format") ?? "png").toLowerCase();
    if (!locationId) throw new ValidationError("locationId is required");

    const location = await locationRepository.findByIdForTenant(
      locationId,
      ctx.tenantId,
    );
    if (!location) throw new NotFoundError("Location not found");

    const tenant = await tenantRepository.findById(ctx.tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");

    const funnelUrl = `${env.APP_URL}/review/${tenant.slug}/${location.slug}`;

    if (format === "svg") {
      const svg = await qrService.toSvg(funnelUrl, { margin: 2 });
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const dataUrl = await qrService.toPngDataUrl(funnelUrl, { size: 512 });
    return ok({ dataUrl, url: funnelUrl });
  } catch (err) {
    return handleError(err);
  }
}
