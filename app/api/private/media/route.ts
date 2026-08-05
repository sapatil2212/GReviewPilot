/**
 * GET /api/private/media
 *
 * Paginated list of the tenant's media assets. Every item carries a
 * short-lived signed URL so the client can render previews without a
 * second request.
 *
 * Query params:
 *   page, pageSize, search, sortBy (createdAt|updatedAt|filename|sizeBytes|category), sortDir
 *   category, kind, status, visibility, locationId, uploadedById
 *   includeDeleted=true
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { mediaService } from "@/server/services/media.service";
import { listMediaQuerySchema } from "@/server/validators/media.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "media:read");
    const url = new URL(req.url);
    const filter = listMediaQuerySchema.parse({
      category: url.searchParams.get("category") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      visibility: url.searchParams.get("visibility") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
      uploadedById: url.searchParams.get("uploadedById") ?? undefined,
      includeDeleted: url.searchParams.get("includeDeleted") ?? undefined,
    });
    const page = await mediaService.list(ctx, req, filter);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}
