/**
 * GET  /api/private/sites/[siteId]/revisions — version history
 * POST /api/private/sites/[siteId]/revisions — restore a version
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteService } from "@/server/services/site.service";
import { rollbackSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");
    const { siteId } = await params;

    const pageId = new URL(req.url).searchParams.get("pageId") ?? undefined;
    return ok(await siteService.listRevisions(ctx, siteId, req, pageId));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    // Restoring overwrites current content, so it needs the same authority as
    // publishing rather than plain edit access.
    requirePermission(ctx, "site:publish");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const { revisionId } = rollbackSchema.parse(body);
    const result = await siteService.rollback(ctx, siteId, revisionId, req);

    return ok(result, { message: "Version restored" });
  } catch (err) {
    return handleError(err);
  }
}
