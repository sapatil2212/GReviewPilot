/**
 * GET /api/private/site-templates — browse the template gallery
 *
 * Not nested under /sites/[siteId] because templates are chosen BEFORE a site
 * exists (`createSiteSchema.templateSlug`), unlike every other resource in
 * this module which belongs to an already-created site.
 *
 * Returns gallery metadata (page list, palette, preview URL) rather than the
 * raw blueprint: the blueprint for 15 templates is megabytes of node trees,
 * and the gallery only needs enough to render a card. The full document is
 * fetched per-template by the preview route when the user asks to see one.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteTemplatePreviewService } from "@/server/services/siteTemplatePreview.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");

    const industry = new URL(req.url).searchParams.get("industry") ?? undefined;
    const templates = await siteTemplatePreviewService.listForGallery(ctx.tenantId, industry);

    return ok(templates);
  } catch (err) {
    return handleError(err);
  }
}
