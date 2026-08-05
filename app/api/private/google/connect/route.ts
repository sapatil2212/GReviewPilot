/**
 * GET /api/private/google/connect
 *
 * Returns a Google consent URL that the client redirects the browser
 * to. Includes an HMAC-signed `state` binding the return trip to the
 * initiating tenant + user.
 */

import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "google:manage");
    const url = googleAccountService.buildConnectUrl(ctx);
    return ok({ url });
  } catch (err) {
    return handleError(err);
  }
}
