/**
 * PATCH  /api/private/sites/[siteId]/forms/[formId] — fields, notifications
 * DELETE /api/private/sites/[siteId]/forms/[formId] — remove the form
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteFormService } from "@/server/services/siteForm.service";
import { updateFormSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string; formId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:form:manage");
    const { siteId, formId } = await params;

    const body = await req.json().catch(() => null);
    // `slug` is intentionally not updatable: the published page references the
    // form by id, but exports and integrations key off the slug.
    const input = updateFormSchema.parse(body);
    const form = await siteFormService.update(ctx, siteId, formId, input, req);

    return ok({ id: form.id, name: form.name }, { message: "Form updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:form:manage");
    const { siteId, formId } = await params;
    await siteFormService.remove(ctx, siteId, formId, req);
    return ok({ deleted: true }, { message: "Form deleted. Existing leads are kept." });
  } catch (err) {
    return handleError(err);
  }
}
