/**
 * GET  /api/private/sites/[siteId]/domains — domains + DNS instructions
 * POST /api/private/sites/[siteId]/domains — add a custom domain
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteDomainService } from "@/server/services/siteDomain.service";
import { addDomainSchema } from "@/server/validators/site.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:domain:read");
    const { siteId } = await params;

    return ok({
      domains: await siteDomainService.list(ctx, siteId),
      wizard: siteDomainService.wizardSteps(),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:domain:manage");
    const { siteId } = await params;

    const body = await req.json().catch(() => null);
    const input = addDomainSchema.parse(body);
    const domain = await siteDomainService.add(ctx, siteId, input, req);

    return ok(domain, {
      message: "Domain added. Create the DNS records shown, then verify.",
      status: 201,
    });
  } catch (err) {
    return handleError(err);
  }
}
