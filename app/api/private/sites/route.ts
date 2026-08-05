/**
 * GET  /api/private/sites  — list the tenant's websites
 * POST /api/private/sites  — create a website
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteService } from "@/server/services/site.service";
import { createSiteSchema, listSitesSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");

    const params = new URL(req.url).searchParams;
    const filter = listSitesSchema.parse({
      status: params.get("status") ?? undefined,
      includeDeleted: params.get("includeDeleted") ?? undefined,
    });

    const data = await siteService.list(ctx, req, filter);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:create");

    const body = await req.json().catch(() => null);
    const input = createSiteSchema.parse(body);
    const site = await siteService.create(ctx, input, req);

    return ok(
      { id: site.id, name: site.name, slug: site.slug, status: site.status },
      { message: "Website created", status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
