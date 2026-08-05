/**
 * POST   /api/private/sites/[siteId]/publish — publish draft pages
 * DELETE /api/private/sites/[siteId]/publish — unpublish the site
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteService } from "@/server/services/site.service";
import { publishSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:publish");
    const { siteId } = await params;

    const body = await req.json().catch(() => ({}));
    const input = publishSchema.parse(body ?? {});
    const result = await siteService.publish(ctx, siteId, input, req);

    return ok(
      {
        status: result.site.status,
        publishedAt: result.site.publishedAt,
        pagesPublished: result.pagesPublished,
        publicUrl: result.publicUrl,
      },
      { message: "Website published" },
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:publish");
    const { siteId } = await params;
    const site = await siteService.unpublish(ctx, siteId, req);
    return ok({ status: site.status }, { message: "Website unpublished" });
  } catch (err) {
    return handleError(err);
  }
}
