/**
 * GET    /api/private/sites/[siteId]/leads/[leadId] — one lead (marks it read)
 * DELETE /api/private/sites/[siteId]/leads/[leadId] — permanently delete
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteFormService } from "@/server/services/siteForm.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string; leadId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:lead:read");
    const { siteId, leadId } = await params;
    return ok(await siteFormService.getLead(ctx, siteId, leadId));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    // Deleting a customer enquiry is irreversible, so it needs form-management
    // authority rather than plain read access. This is also the GDPR
    // erasure path, which is why a hard delete is offered at all.
    requirePermission(ctx, "site:form:manage");
    const { siteId, leadId } = await params;
    await siteFormService.removeLead(ctx, siteId, leadId);
    return ok({ deleted: true }, { message: "Lead deleted" });
  } catch (err) {
    return handleError(err);
  }
}
