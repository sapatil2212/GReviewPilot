/**
 * GET  /api/private/locations   — list locations (paginated, filterable, searchable)
 * POST /api/private/locations   — create a location
 *
 * Query params:
 *   page, pageSize, search, sortBy (createdAt|updatedAt|name|city|status), sortDir
 *   status=ACTIVE|INACTIVE|ARCHIVED|DELETED
 *   managerId=<cuid>
 *   includeDeleted=true
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { locationService } from "@/server/services/location.service";
import {
  createLocationSchema,
  listLocationsQuerySchema,
} from "@/server/validators/business.schema";
import { buildPagedResult, parsePagination } from "@/server/utils/pagination";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:read");
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const filter = listLocationsQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      managerId: url.searchParams.get("managerId") ?? undefined,
      includeDeleted: url.searchParams.get("includeDeleted") ?? undefined,
    });
    const { items, total } = await locationService.list(ctx, req, filter);
    return ok(buildPagedResult(items, total, pagination));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "location:create");
    const body = await req.json().catch(() => null);
    const input = createLocationSchema.parse(body);
    const location = await locationService.create(ctx, input, req);
    return ok(location, { message: "Location created", status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
