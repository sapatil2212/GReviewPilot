/**
 * POST /api/private/sites/[siteId]/domains/[domainId]/ssl
 *
 * Inspect the live certificate for a custom domain and update its stored SSL
 * state. Separate from the DNS verification endpoint because the two answer
 * different questions — "does DNS point at us" versus "is HTTPS actually
 * working" — and a tenant waiting on issuance needs to re-ask only the second
 * one, repeatedly, without re-running DNS lookups each time.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { siteDomainService } from "@/server/services/siteDomain.service";
import { checkRateLimit } from "@/server/middleware/rateLimit";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
// A TLS handshake plus a CAA lookup can take several seconds against a slow or
// unreachable host.
export const maxDuration = 30;

type Params = { params: Promise<{ siteId: string; domainId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "site:domain:manage");
    const { siteId, domainId } = await params;

    // Polling while waiting for issuance is the expected behaviour here, so the
    // limit is generous — it exists to stop a runaway client, not to slow down a
    // tenant refreshing every few seconds.
    checkRateLimit({ key: `domain-ssl:${domainId}`, max: 60, windowMs: 10 * 60 * 1000 });

    const result = await siteDomainService.checkSsl(ctx, siteId, domainId, req);

    return ok(result, {
      message: result.valid
        ? result.renewalDue
          ? "HTTPS is active but the certificate is due for renewal"
          : "HTTPS is active"
        : result.summary,
    });
  } catch (err) {
    return handleError(err);
  }
}
