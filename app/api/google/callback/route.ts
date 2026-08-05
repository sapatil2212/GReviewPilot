/**
 * GET /api/google/callback?code=&state=
 *
 * Public — Google redirects the browser here after the consent screen.
 * The `state` parameter is our HMAC-signed token binding the callback
 * to the tenant + user who initiated the flow, so we don't need a
 * server-side session cache.
 *
 * On success: redirect to /dashboard/integrations/google?status=connected.
 * On failure: redirect to the same page with ?status=error&message=...
 * The URL never carries tokens.
 */

import { NextResponse, type NextRequest } from "next/server";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { env } from "@/server/utils/env";
import { googleCallbackQuerySchema } from "@/server/validators/google.schema";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

function returnUrl(status: "connected" | "error", message?: string): URL {
  const u = new URL("/dashboard/integrations/google", env.APP_URL);
  u.searchParams.set("status", status);
  if (message) u.searchParams.set("message", message);
  return u;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = googleCallbackQuerySchema.parse({
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
      error: url.searchParams.get("error") ?? undefined,
      error_description:
        url.searchParams.get("error_description") ?? undefined,
    });

    if (parsed.error) {
      logger.info("Google OAuth returned error", {
        error: parsed.error,
        description: parsed.error_description,
      });
      return NextResponse.redirect(
        returnUrl("error", parsed.error_description ?? parsed.error),
      );
    }

    if (!parsed.code || !parsed.state) {
      return NextResponse.redirect(
        returnUrl("error", "Google did not return a code or state parameter"),
      );
    }

    const state = googleAccountService.verifyState(parsed.state);
    await googleAccountService.completeOAuth(state, parsed.code, req);

    return NextResponse.redirect(returnUrl("connected"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google OAuth failed";
    logger.warn("Google OAuth callback failed", { message });
    return NextResponse.redirect(returnUrl("error", message));
  }
}
