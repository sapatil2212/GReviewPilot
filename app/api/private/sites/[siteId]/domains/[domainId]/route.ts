/**
 * PATCH  /api/private/sites/[siteId]/domains/[domainId] — primary / redirect
 * POST   /api/private/sites/[siteId]/domains/[domainId] — run DNS verification
 * DELETE /api/private/sites/[siteId]/domains/[domainId] — remove the domain
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteDomainService } from "@/server/services/siteDomain.service";
import { updateDomainSchema } from "@/server/validators/site.schema";
import { checkRateLimit } from "@/server/middleware/rateLimit";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ siteId: string; domainId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:domain:manage");
    const { siteId, domainId } = await params;

    // Each verification performs live DNS queries against public resolvers.
    // Capped so an impatient user clicking Verify repeatedly cannot have us
    // rate-limited by those resolvers.
    checkRateLimit({ key: `domain-verify:${domainId}`, max: 20, windowMs: 10 * 60 * 1000 });

    const result = await siteDomainService.verify(ctx, siteId, domainId, req);

    return ok(
      result,
      result.connected
        ? { message: "Domain verified and connected" }
        : { message: "Not verified yet. DNS changes can take a while to propagate." },
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:domain:manage");
    const { siteId, domainId } = await params;

    const body = await req.json().catch(() => null);
    const input = updateDomainSchema.parse(body);
    const domain = await siteDomainService.update(ctx, siteId, domainId, input, req);

    return ok(domain, { message: "Domain updated" });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:domain:manage");
    const { siteId, domainId } = await params;
    await siteDomainService.remove(ctx, siteId, domainId, req);
    return ok({ removed: true }, { message: "Domain removed" });
  } catch (err) {
    return handleError(err);
  }
}
