/**
 * GET /api/private/sites/[siteId]/audit — SEO, accessibility, conversion,
 * and performance findings for a page.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteAiService } from "@/server/services/siteAi.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");
    const { siteId } = await params;

    const pageId = new URL(req.url).searchParams.get("pageId") ?? undefined;
    return ok(await siteAiService.audit(ctx, siteId, pageId));
  } catch (err) {
    return handleError(err);
  }
}
