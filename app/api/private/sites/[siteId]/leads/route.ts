/**
 * GET   /api/private/sites/[siteId]/leads — the lead inbox
 * PATCH /api/private/sites/[siteId]/leads — bulk status change
 *
 * Guarded by `site:lead:read` rather than `site:read`: leads are customer
 * contact details, so a VIEWER who may look at page content should not
 * automatically get the enquiry list.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteFormService } from "@/server/services/siteForm.service";
import { bulkLeadsSchema, listLeadsSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:lead:read");
    const { siteId } = await params;

    const search = new URL(req.url).searchParams;
    const filter = listLeadsSchema.parse({
      formId: search.get("formId") ?? undefined,
      status: search.get("status") ?? undefined,
      includeSpam: search.get("includeSpam") ?? undefined,
    });

    return ok(await siteFormService.listLeads(ctx, siteId, req, filter));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:lead:read");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const input = bulkLeadsSchema.parse(body);
    const result = await siteFormService.setLeadStatus(ctx, siteId, input.ids, input.status);

    return ok(result, { message: `${result.updated} lead(s) updated` });
  } catch (err) {
    return handleError(err);
  }
}
