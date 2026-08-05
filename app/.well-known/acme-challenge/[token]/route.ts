/**
 * GET /.well-known/acme-challenge/[token]
 *
 * HTTP-01 validation endpoint. Let's Encrypt fetches this over plain HTTP on the
 * tenant's own hostname during issuance and expects the key authorization as the
 * response body.
 *
 * Necessarily unauthenticated: the CA presents no credentials, and it must be
 * reachable on port 80 before any certificate exists. The token is the secret —
 * it is high-entropy, single-use, issued by us moments earlier, and useless to
 * anyone who cannot already complete the order.
 *
 * middleware.ts must let `/.well-known/` through untouched on custom hostnames,
 * otherwise this is rewritten into the site renderer and every issuance fails
 * with the tenant's 404 page. There is a smoke assertion covering that.
 */

import { acmeChallengeStore } from "@/server/services/acme/challengeStore";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;

  const keyAuthorization = await acmeChallengeStore.get(token).catch((err) => {
    logger.error("ACME challenge lookup failed", { err: String(err) });
    return null;
  });

  if (!keyAuthorization) {
    // Plain 404: the CA only cares about the status and body, and echoing the
    // requested token back would add nothing but noise to the logs.
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  logger.info("Served ACME challenge", { token: token.slice(0, 8) });

  return new Response(keyAuthorization, {
    status: 200,
    headers: {
      // RFC 8555 specifies text/plain, and a cached response would break the
      // next order that reuses this path.
      "Content-Type": "text/plain",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
