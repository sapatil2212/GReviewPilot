/**
 * Classify Google API errors into stable internal categories.
 *
 * Ordering matters. Google's OAuth endpoints and its Business Profile
 * endpoints report failures in two different shapes, and the HTTP status
 * alone is not enough to tell them apart:
 *
 *   - OAuth token endpoint: HTTP 400 with `{ error: "invalid_grant" }`.
 *     Classifying that on status alone yields INVALID_REQUEST, which is
 *     non-retryable but also never flips the account to REAUTH_REQUIRED —
 *     so a revoked refresh token would be retried by auto-sync forever.
 *   - GBP endpoints: HTTP 403 with `error.details[].reason = SERVICE_DISABLED`
 *     when the Cloud project is not enabled/allowlisted for the API. That is
 *     an operator problem, not "this user lacks permission".
 *
 * So we match on the error *body* first and fall back to status.
 */

import type { GoogleErrorCategory } from "./types";

/**
 * OAuth 2.0 error codes (RFC 6749 §5.2 plus Google's additions) mapped to
 * our categories. These arrive both on the token endpoint response body and
 * as the `error` query parameter on the redirect callback.
 */
const OAUTH_ERROR_CATEGORIES: Record<string, GoogleErrorCategory> = {
  // Refresh token revoked, expired, or already used. Needs re-consent.
  invalid_grant: "GOOGLE_AUTH_ERROR",
  // User declined, app in Testing and user is not a tester, app unverified.
  access_denied: "GOOGLE_CONSENT_REQUIRED",
  admin_policy_enforced: "GOOGLE_CONSENT_REQUIRED",
  disallowed_useragent: "GOOGLE_CONSENT_REQUIRED",
  org_internal: "GOOGLE_CONSENT_REQUIRED",
  consent_required: "GOOGLE_CONSENT_REQUIRED",
  interaction_required: "GOOGLE_CONSENT_REQUIRED",
  login_required: "GOOGLE_CONSENT_REQUIRED",
  // Our client credentials / redirect URI are wrong.
  invalid_client: "GOOGLE_CONFIG_ERROR",
  unauthorized_client: "GOOGLE_CONFIG_ERROR",
  redirect_uri_mismatch: "GOOGLE_CONFIG_ERROR",
  invalid_redirect_uri: "GOOGLE_CONFIG_ERROR",
  // The app asked for a scope it is not allowed to request.
  invalid_scope: "GOOGLE_SCOPE_INSUFFICIENT",
  // Google-side.
  temporarily_unavailable: "GOOGLE_SERVER_ERROR",
  server_error: "GOOGLE_SERVER_ERROR",
};

/**
 * `reason` values Google attaches to 403s. `error.errors[].reason` is the
 * legacy shape; `error.details[].reason` is the current one.
 */
const REASON_CATEGORIES: Record<string, GoogleErrorCategory> = {
  SERVICE_DISABLED: "GOOGLE_API_DISABLED",
  API_KEY_SERVICE_BLOCKED: "GOOGLE_API_DISABLED",
  accessNotConfigured: "GOOGLE_API_DISABLED",
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: "GOOGLE_SCOPE_INSUFFICIENT",
  insufficientPermissions: "GOOGLE_SCOPE_INSUFFICIENT",
  forbidden: "GOOGLE_PERMISSION_ERROR",
  rateLimitExceeded: "GOOGLE_RATE_LIMIT",
  userRateLimitExceeded: "GOOGLE_RATE_LIMIT",
  quotaExceeded: "GOOGLE_QUOTA_EXCEEDED",
  RESOURCE_EXHAUSTED: "GOOGLE_QUOTA_EXCEEDED",
};

export function classifyGoogleError(
  status: number,
  body?: unknown,
  networkError?: boolean,
): GoogleErrorCategory {
  if (networkError) return "GOOGLE_NETWORK_ERROR";

  const code = extractCode(body);
  const message = extractMessage(body).toLowerCase();
  const reasons = extractReasons(body);

  // 1. Explicit OAuth error codes. Checked first because their HTTP status
  //    (usually 400) is misleading.
  const oauthCategory = OAUTH_ERROR_CATEGORIES[code];
  if (oauthCategory) return oauthCategory;

  // 2. Structured `reason` values from GBP / Cloud endpoints.
  for (const reason of reasons) {
    const mapped = REASON_CATEGORIES[reason];
    if (mapped) return mapped;
  }

  // 3. The project is not enabled or not allowlisted for this API. Google
  //    phrases this several ways; all of them mean "an owner must act".
  if (
    message.includes("has not been used in project") ||
    message.includes("is disabled for this project") ||
    message.includes("api has not been used") ||
    message.includes("enable the api") ||
    message.includes("not allowlisted") ||
    message.includes("has not been allowlisted") ||
    message.includes("project is not allowed")
  ) {
    return "GOOGLE_API_DISABLED";
  }

  // 4. Scope problems reported as prose rather than a reason code.
  if (
    message.includes("insufficient authentication scope") ||
    message.includes("request had insufficient authentication scopes") ||
    message.includes("insufficient scope")
  ) {
    return "GOOGLE_SCOPE_INSUFFICIENT";
  }

  if (
    status === 429 ||
    code === "RESOURCE_EXHAUSTED" ||
    message.includes("quota exceeded") ||
    message.includes("rate limit")
  ) {
    if (message.includes("quota") || code === "RESOURCE_EXHAUSTED") {
      return "GOOGLE_QUOTA_EXCEEDED";
    }
    return "GOOGLE_RATE_LIMIT";
  }

  if (status === 401 || code === "UNAUTHENTICATED") {
    return "GOOGLE_AUTH_ERROR";
  }

  if (
    status === 403 ||
    code === "PERMISSION_DENIED" ||
    message.includes("permission")
  ) {
    return "GOOGLE_PERMISSION_ERROR";
  }

  if (status === 404 || code === "NOT_FOUND") {
    return "GOOGLE_NOT_FOUND";
  }

  if (status === 400 || status === 422 || code === "INVALID_ARGUMENT") {
    return "GOOGLE_INVALID_REQUEST";
  }

  if (status >= 500 || code === "UNAVAILABLE" || code === "INTERNAL") {
    return "GOOGLE_SERVER_ERROR";
  }

  return "GOOGLE_UNKNOWN_ERROR";
}

export function isRetryableCategory(category: GoogleErrorCategory): boolean {
  return (
    category === "GOOGLE_RATE_LIMIT" ||
    category === "GOOGLE_QUOTA_EXCEEDED" ||
    category === "GOOGLE_SERVER_ERROR" ||
    category === "GOOGLE_NETWORK_ERROR"
  );
}

/**
 * Categories that mean "no amount of retrying will help — a human must
 * reconnect or reconfigure". Sync handlers use this to stop requeueing.
 */
export function isTerminalCategory(category: GoogleErrorCategory): boolean {
  return (
    category === "GOOGLE_AUTH_ERROR" ||
    category === "GOOGLE_SCOPE_INSUFFICIENT" ||
    category === "GOOGLE_CONSENT_REQUIRED" ||
    category === "GOOGLE_API_DISABLED" ||
    category === "GOOGLE_CONFIG_ERROR"
  );
}

/**
 * Categories the *end user* can resolve by reconnecting their Google
 * account. GOOGLE_API_DISABLED and GOOGLE_CONFIG_ERROR are deliberately
 * excluded: reconnecting cannot fix a Cloud project problem, and telling a
 * tenant to retry would just loop them through consent.
 */
export function requiresReconnect(category: GoogleErrorCategory): boolean {
  return (
    category === "GOOGLE_AUTH_ERROR" ||
    category === "GOOGLE_SCOPE_INSUFFICIENT" ||
    category === "GOOGLE_CONSENT_REQUIRED"
  );
}

export function userFacingGoogleMessage(category: GoogleErrorCategory): string {
  switch (category) {
    case "GOOGLE_RATE_LIMIT":
    case "GOOGLE_QUOTA_EXCEEDED":
      return "Google is temporarily limiting requests. Your synchronization has been queued and will retry automatically.";
    case "GOOGLE_AUTH_ERROR":
      return "Your Google connection needs to be reauthorized.";
    case "GOOGLE_SCOPE_INSUFFICIENT":
      return "Reconnect Google and leave the Business Profile permission checked — we need it to read your locations and reviews.";
    case "GOOGLE_CONSENT_REQUIRED":
      return "Google blocked the sign-in for this account. Ask your workspace administrator to allow GReviewPilot, then try again.";
    case "GOOGLE_API_DISABLED":
      return "The Google Business Profile connection is not available yet. Our team has been notified — no action is needed from you.";
    case "GOOGLE_CONFIG_ERROR":
      return "The Google connection is misconfigured on our side. Our team has been notified.";
    case "GOOGLE_PERMISSION_ERROR":
      return "This Google account does not have permission to access this Business Profile.";
    case "GOOGLE_NOT_FOUND":
      return "The requested Google Business Profile resource was not found.";
    case "GOOGLE_INVALID_REQUEST":
      return "Google rejected the request. Please try again or reconnect your account.";
    case "GOOGLE_SERVER_ERROR":
    case "GOOGLE_NETWORK_ERROR":
      return "Google is temporarily unavailable. We will retry automatically.";
    default:
      return "Something went wrong talking to Google. Please try again later.";
  }
}

/**
 * Operator-facing remediation for the categories only a project owner can
 * fix. Logged (never shown to tenants) so the cause is obvious in logs
 * instead of buried in a sanitized user message.
 */
export function operatorRemediation(
  category: GoogleErrorCategory,
): string | null {
  switch (category) {
    case "GOOGLE_API_DISABLED":
      return (
        "The Cloud project is not enabled or not allowlisted for the Business Profile APIs. " +
        "Enable the Business Profile API family in the Google Cloud console, and confirm the " +
        "project's Business Profile API quota is above 0 — a limit of 0 means the access " +
        "request has not been approved yet."
      );
    case "GOOGLE_CONFIG_ERROR":
      return (
        "Check GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, and confirm GOOGLE_REDIRECT_URI is " +
        "registered verbatim as an Authorized redirect URI on the OAuth client."
      );
    case "GOOGLE_CONSENT_REQUIRED":
      return (
        "Google refused to issue a grant. If the OAuth app is still in Testing, only listed " +
        "test users can connect — publish the app and complete verification for the " +
        "business.manage scope, or add the account as a test user."
      );
    case "GOOGLE_SCOPE_INSUFFICIENT":
      return (
        "The token is missing https://www.googleapis.com/auth/business.manage. Confirm the " +
        "scope is listed on the OAuth consent screen and that the user did not untick it."
      );
    default:
      return null;
  }
}

function extractCode(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  if (typeof b.error === "string") return b.error;
  const inner = b.error as Record<string, unknown> | undefined;
  if (inner && typeof inner.status === "string") return inner.status;
  if (inner && typeof inner.code === "string") return inner.code;
  return "";
}

function extractMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  if (typeof b.error_description === "string") return b.error_description;
  if (typeof b.error === "string") return b.error;
  const inner = b.error as Record<string, unknown> | undefined;
  if (inner && typeof inner.message === "string") return inner.message;
  return "";
}

/**
 * Collect `reason` values from both shapes Google uses:
 *   error.errors[].reason      (legacy)
 *   error.details[].reason     (google.rpc.ErrorInfo)
 */
function extractReasons(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const inner = (body as Record<string, unknown>).error as
    | Record<string, unknown>
    | undefined;
  if (!inner || typeof inner !== "object") return [];

  const out: string[] = [];
  for (const key of ["errors", "details"] as const) {
    const list = inner[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item === "object") {
        const reason = (item as Record<string, unknown>).reason;
        if (typeof reason === "string" && reason) out.push(reason);
      }
    }
  }
  return out;
}
