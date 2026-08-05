/**
 * PATCH /api/private/sites/[siteId]/theme — update global styles
 *
 * Separate from the site PATCH endpoint because a theme change repaints every
 * page at once, so it carries its own permission (`site:theme`) and its own
 * audit action.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteService } from "@/server/services/site.service";
import { themePatchSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:theme");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const patch = themePatchSchema.parse(body);
    const theme = await siteService.updateTheme(ctx, siteId, patch, req);

    return ok(theme, { message: "Theme updated" });
  } catch (err) {
    return handleError(err);
  }
}
