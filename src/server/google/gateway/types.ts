/**
 * Shared types for the centralized Google API gateway.
 */

export type GoogleApiName =
  | "ACCOUNT_MANAGEMENT"
  | "BUSINESS_INFORMATION"
  | "REVIEWS"
  | "PERFORMANCE"
  | "OAUTH"
  | "USERINFO"
  | "PLACES"
  | "OTHER";

export type GoogleErrorCategory =
  | "GOOGLE_AUTH_ERROR"
  | "GOOGLE_PERMISSION_ERROR"
  | "GOOGLE_NOT_FOUND"
  | "GOOGLE_RATE_LIMIT"
  | "GOOGLE_QUOTA_EXCEEDED"
  | "GOOGLE_SERVER_ERROR"
  | "GOOGLE_NETWORK_ERROR"
  | "GOOGLE_INVALID_REQUEST"
  /**
   * The Google API itself is not usable by this Cloud project: the API is
   * not enabled, or the project has not been allowlisted for the Business
   * Profile APIs (in which case Google reports a quota limit of 0).
   * Distinct from PERMISSION_ERROR, which is about the *end user's* access
   * to a given profile. Only a project owner can fix this, so retrying is
   * pointless and the operator needs to be told explicitly.
   */
  | "GOOGLE_API_DISABLED"
  /**
   * The OAuth client rejected the user rather than the request: the app is
   * still in Testing and the account is not a registered test user, the
   * app failed/never completed verification, or a Workspace admin policy
   * blocks it. Surfaces as `access_denied` on the callback.
   */
  | "GOOGLE_CONSENT_REQUIRED"
  /**
   * Authenticated, but the access token is missing a scope the call needs
   * — typically because the user unticked `business.manage` on the consent
   * screen. Requires re-consent, not a token refresh.
   */
  | "GOOGLE_SCOPE_INSUFFICIENT"
  /**
   * Our own OAuth client is misconfigured (bad client id/secret, redirect
   * URI mismatch). A deployment error, never the user's fault.
   */
  | "GOOGLE_CONFIG_ERROR"
  | "GOOGLE_UNKNOWN_ERROR";

export interface GoogleGatewayRequest {
  apiName: GoogleApiName;
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  /** Access token — never logged. */
  accessToken?: string;
  tenantId?: string | null;
  googleAccountId?: string | null;
  /** Skip rate limiting (OAuth token exchange only). */
  skipRateLimit?: boolean;
  /** Max gateway-level retries for this call (overrides env default). */
  maxRetries?: number;
}

export interface GoogleGatewayResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  requestId: string;
  durationMs: number;
  retryCount: number;
  errorCategory?: GoogleErrorCategory;
}

/**
 * Parse a `Retry-After` header into milliseconds. Google sends either a
 * delay in seconds or an HTTP date. Returns undefined when absent or
 * unparseable so callers fall back to exponential backoff.
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
): number | undefined {
  if (!headerValue) return undefined;
  const raw = headerValue.trim();

  // delay-seconds form
  if (/^\d+$/.test(raw)) {
    const ms = Number(raw) * 1000;
    return ms > 0 ? ms : undefined;
  }

  // HTTP-date form
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  const delta = at - Date.now();
  return delta > 0 ? delta : undefined;
}

export function detectApiName(url: string): GoogleApiName {
  if (url.includes("mybusinessaccountmanagement.googleapis.com")) {
    return "ACCOUNT_MANAGEMENT";
  }
  if (url.includes("mybusinessbusinessinformation.googleapis.com")) {
    return "BUSINESS_INFORMATION";
  }
  if (url.includes("mybusiness.googleapis.com")) {
    return "REVIEWS";
  }
  if (url.includes("businessprofileperformance.googleapis.com")) {
    return "PERFORMANCE";
  }
  if (url.includes("oauth2.googleapis.com") || url.includes("accounts.google.com")) {
    return "OAUTH";
  }
  if (url.includes("openidconnect.googleapis.com")) {
    return "USERINFO";
  }
  if (
    url.includes("places.googleapis.com") ||
    url.includes("maps.googleapis.com")
  ) {
    return "PLACES";
  }
  return "OTHER";
}

export function sanitizeEndpoint(url: string): string {
  try {
    const u = new URL(url);
    // Drop query string values that might contain tokens; keep path + param names.
    const keys = [...u.searchParams.keys()];
    return keys.length > 0
      ? `${u.origin}${u.pathname}?${keys.join("&")}`
      : `${u.origin}${u.pathname}`;
  } catch {
    return url.slice(0, 200);
  }
}
