/**
 * GET    /api/private/sites/[siteId]  — full site with pages and domains
 * PATCH  /api/private/sites/[siteId]  — update settings, brand, SEO
 * DELETE /api/private/sites/[siteId]  — soft delete
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteService } from "@/server/services/site.service";
import { updateSiteSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");
    const { siteId } = await params;
    return ok(await siteService.get(ctx, siteId));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:update");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const input = updateSiteSchema.parse(body);
    const site = await siteService.update(ctx, siteId, input, req);

    return ok(
      { id: site.id, name: site.name, slug: site.slug },
      { message: "Website updated" },
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:delete");
    const { siteId } = await params;
    await siteService.remove(ctx, siteId, req);
    return ok({ deleted: true }, { message: "Website deleted" });
  } catch (err) {
    return handleError(err);
  }
}
