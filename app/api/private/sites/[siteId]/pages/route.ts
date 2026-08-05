/**
 * GET  /api/private/sites/[siteId]/pages — page list (metadata only)
 * POST /api/private/sites/[siteId]/pages — create a page
 * PUT  /api/private/sites/[siteId]/pages — reorder pages
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { sitePageService } from "@/server/services/sitePage.service";
import { createPageSchema, reorderPagesSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");
    const { siteId } = await params;
    return ok(await sitePageService.list(ctx, siteId));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:update");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const input = createPageSchema.parse(body);
    const page = await sitePageService.create(ctx, siteId, input, req);

    return ok(
      { id: page.id, title: page.title, path: page.path, isHome: page.isHome },
      { message: "Page created", status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:update");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const { pageIds } = reorderPagesSchema.parse(body);
    await sitePageService.reorder(ctx, siteId, pageIds, req);

    return ok({ reordered: pageIds.length }, { message: "Pages reordered" });
  } catch (err) {
    return handleError(err);
  }
}
