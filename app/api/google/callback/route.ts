/**
 * GET /api/google/callback?code=&state=
 *
 * Public — Google redirects the browser here after the consent screen.
 * The `state` parameter is our HMAC-signed token binding the callback
 * to the tenant + user who initiated the flow, so we don't need a
 * server-side session cache.
 *
 * On success: redirect to /dashboard/integrations/google?status=connected.
 * On failure: redirect to the same page with ?status=error&reason=&message=
 * The URL never carries tokens.
 */

import { NextResponse, type NextRequest } from "next/server";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { env } from "@/server/utils/env";
import { googleCallbackQuerySchema } from "@/server/validators/google.schema";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

/**
 * Stable reason codes the dashboard can branch on. Google's own
 * `error_description` is terse, sometimes absent, and occasionally leaks
 * project internals, so it is logged rather than shown.
 */
type CallbackReason =
  | "consent_denied"
  | "not_verified"
  | "admin_blocked"
  | "misconfigured"
  | "scope_missing"
  | "state_invalid"
  | "unknown";

/**
 * Map Google's OAuth `error` parameter to a reason code plus the guidance a
 * tenant admin can actually act on.
 *
 * `access_denied` is deliberately split from the others: it is by far the most
 * common failure and it means two very different things. If the user clicked
 * "Cancel" they just need to try again. If the OAuth app is still in Testing
 * (or failed verification) Google returns the same code without ever showing
 * a consent screen — retrying will never work, and the fix belongs to us, not
 * the tenant. We cannot tell the two apart from the callback alone, so the
 * message covers both and the log line carries the detail.
 */
function describeOAuthError(
  error: string,
  description?: string,
): { reason: CallbackReason; message: string } {
  switch (error) {
    case "access_denied":
      return {
        reason: "consent_denied",
        message:
          "Google did not complete the connection. If you cancelled the consent screen, " +
          "just try again. If you never saw one, this app is not yet approved for your " +
          "Google account — contact support and we'll enable it.",
      };
    case "admin_policy_enforced":
      return {
        reason: "admin_blocked",
        message:
          "Your Google Workspace administrator has blocked third-party access for this " +
          "account. Ask them to allow GReviewPilot, then try again.",
      };
    case "org_internal":
      return {
        reason: "admin_blocked",
        message:
          "This Google account belongs to an organisation that restricts external apps. " +
          "Try connecting with the account that manages your Business Profile.",
      };
    case "disallowed_useragent":
      return {
        reason: "consent_denied",
        message:
          "Google blocked the sign-in because of the browser being used. Open the " +
          "dashboard in Chrome, Safari, Edge or Firefox and connect again.",
      };
    case "invalid_scope":
      return {
        reason: "scope_missing",
        message:
          "Google rejected the requested Business Profile permission. Our team has been " +
          "notified — no action is needed from you.",
      };
    case "invalid_client":
    case "unauthorized_client":
    case "redirect_uri_mismatch":
      return {
        reason: "misconfigured",
        message:
          "The Google connection is misconfigured on our side. Our team has been notified.",
      };
    case "server_error":
    case "temporarily_unavailable":
      return {
        reason: "unknown",
        message: "Google is temporarily unavailable. Please try again in a few minutes.",
      };
    default:
      return {
        reason: "unknown",
        message:
          description && description.length < 160
            ? description
            : "Google could not complete the connection. Please try again.",
      };
  }
}

function returnUrl(
  status: "connected" | "error",
  opts?: { message?: string; reason?: CallbackReason },
): URL {
  const u = new URL("/dashboard/integrations/google", env.APP_URL);
  u.searchParams.set("status", status);
  if (opts?.reason) u.searchParams.set("reason", opts.reason);
  if (opts?.message) u.searchParams.set("message", opts.message);
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
      const { reason, message } = describeOAuthError(
        parsed.error,
        parsed.error_description,
      );
      // Log the raw values: `access_denied` with no description is the
      // signature of an unpublished / unverified OAuth app, and that
      // distinction is invisible in the sanitized user-facing message.
      logger.warn("Google OAuth returned error", {
        error: parsed.error,
        description: parsed.error_description,
        reason,
        hint:
          parsed.error === "access_denied"
            ? "If users report never seeing a consent screen, the OAuth app is still in " +
              "Testing or failed verification — only listed test users can connect."
            : undefined,
      });
      return NextResponse.redirect(returnUrl("error", { reason, message }));
    }

    if (!parsed.code || !parsed.state) {
      return NextResponse.redirect(
        returnUrl("error", {
          reason: "state_invalid",
          message: "Google did not return a code or state parameter. Please try again.",
        }),
      );
    }

    const state = googleAccountService.verifyState(parsed.state);
    await googleAccountService.completeOAuth(state, parsed.code, req);

    return NextResponse.redirect(returnUrl("connected"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google OAuth failed";
    logger.warn("Google OAuth callback failed", { message });
    return NextResponse.redirect(
      returnUrl("error", { reason: "unknown", message }),
    );
  }
}
