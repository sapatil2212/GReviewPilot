/**
 * GET    /api/private/sites/[siteId]/pages/[pageId] — page + document
 * PATCH  /api/private/sites/[siteId]/pages/[pageId] — page metadata / SEO
 * PUT    /api/private/sites/[siteId]/pages/[pageId] — save the document
 * DELETE /api/private/sites/[siteId]/pages/[pageId] — delete the page
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { sitePageService } from "@/server/services/sitePage.service";
import { savePageDocumentSchema, updatePageSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string; pageId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");
    const { siteId, pageId } = await params;
    return ok(await sitePageService.get(ctx, siteId, pageId));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:update");
    const { siteId, pageId } = await params;

    const body = await req.json().catch(() => null);
    const input = updatePageSchema.parse(body);
    const page = await sitePageService.update(ctx, siteId, pageId, input, req);

    return ok({ id: page.id, title: page.title, path: page.path }, { message: "Page updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:update");
    const { siteId, pageId } = await params;

    const body = await req.json().catch(() => null);
    const input = savePageDocumentSchema.parse(body);
    const result = await sitePageService.saveDocument(ctx, siteId, pageId, input, req);

    // Autosaves are silent; a toast on every keystroke pause would be noise.
    return ok(result, input.autosave ? undefined : { message: "Page saved" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:update");
    const { siteId, pageId } = await params;
    await sitePageService.remove(ctx, siteId, pageId, req);
    return ok({ deleted: true }, { message: "Page deleted" });
  } catch (err) {
    return handleError(err);
  }
}
