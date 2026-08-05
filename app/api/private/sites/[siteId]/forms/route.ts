/**
 * GET  /api/private/sites/[siteId]/forms — forms with unread lead counts
 * POST /api/private/sites/[siteId]/forms — create a form
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteFormService } from "@/server/services/siteForm.service";
import { createFormSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:read");
    const { siteId } = await params;
    return ok(await siteFormService.list(ctx, siteId));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:form:manage");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const input = createFormSchema.parse(body);
    const form = await siteFormService.create(ctx, siteId, input, req);

    return ok(
      { id: form.id, name: form.name, slug: form.slug },
      { message: "Form created", status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
