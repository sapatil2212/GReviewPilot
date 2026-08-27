/**
 * Google Business Profile API client.
 *
 * Wraps OAuth helpers + high-level list methods. Every authenticated
 * Google HTTP call goes through `googleApiGateway` (rate limit, retry
 * policy, telemetry). Feature modules must not bypass this client /
 * the gateway.
 */

import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import {
  GoogleGatewayError,
  googleApiGateway,
} from "@/server/google/gateway/googleApiGateway";
import {
  detectApiName,
  type GoogleErrorCategory,
} from "@/server/google/gateway/types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const ACCOUNT_MGMT_URL = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_URL =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const LEGACY_MY_BUSINESS_URL = "https://mybusiness.googleapis.com/v4";

const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

// ---------- Types ----------

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
  tokenType: string;
}

export interface GoogleUserinfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export interface GoogleAccountResource {
  name: string;
  accountName: string;
  type?: string;
  role?: string;
  verificationState?: string;
  vettedState?: string;
}

export interface GoogleLocationResource {
  name: string;
  title: string;
  storeCode?: string;
  languageCode?: string;
  storefrontAddress?: {
    regionCode?: string;
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    addressLines?: string[];
  };
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  categories?: {
    primaryCategory?: { displayName?: string; name?: string };
    additionalCategories?: Array<{ displayName?: string; name?: string }>;
  };
  websiteUri?: string;
  metadata?: {
    placeId?: string;
    duplicateLocation?: string;
    canDelete?: boolean;
    canOperateLocalPost?: boolean;
  };
}

export interface GoogleApiClient {
  getUserInfo(): Promise<GoogleUserinfo>;
  listAccounts(): Promise<GoogleAccountResource[]>;
  listLocations(accountName: string): Promise<GoogleLocationResource[]>;
  listReviews(locationResourceName: string): Promise<unknown[]>;
  getCurrentTokens(): GoogleTokens;
  refreshIfExpired(): Promise<void>;
}

// ---------- Errors (compat wrapper around gateway errors) ----------

export class GoogleApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;
  readonly category?: GoogleErrorCategory;

  constructor(
    status: number,
    message: string,
    code?: string,
    body?: unknown,
    category?: GoogleErrorCategory,
  ) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = code;
    this.body = body;
    this.category = category;
  }

  static fromGateway(err: GoogleGatewayError): GoogleApiError {
    return new GoogleApiError(
      err.status,
      err.message,
      err.code,
      err.body,
      err.category,
    );
  }
}

// ---------- Scopes ----------

/**
 * The one scope every Business Profile call depends on. `openid`, `email`
 * and `profile` are only used to identify which Google account connected,
 * so they are not treated as required.
 *
 * This matters because Google renders *sensitive* scopes as individual
 * checkboxes on the consent screen. A user can tick "See your personal
 * info" and untick Business Profile access, and Google will still issue a
 * perfectly valid token — every later GBP call then fails with a 403 that
 * looks like a permission problem. We check the granted scope list at the
 * callback instead of discovering it during the first sync.
 */
export const REQUIRED_BUSINESS_SCOPE =
  "https://www.googleapis.com/auth/business.manage";

/** Space-delimited scope string -> set, tolerating extra whitespace. */
function scopeSet(scopes: string): Set<string> {
  return new Set(scopes.split(/[\s,]+/).filter(Boolean));
}

/** True when the granted scope string includes Business Profile access. */
export function hasBusinessScope(granted: string): boolean {
  return scopeSet(granted).has(REQUIRED_BUSINESS_SCOPE);
}

/**
 * Which of the scopes we asked for did the user not grant. Used for
 * diagnostics; the connect flow only hard-fails on the business scope.
 */
export function missingScopes(granted: string): string[] {
  const have = scopeSet(granted);
  return [...scopeSet(env.GOOGLE_BUSINESS_SCOPES)].filter((s) => !have.has(s));
}

// ---------- Static helpers ----------

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: env.GOOGLE_BUSINESS_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function googleRedirectUri(): string {
  return env.GOOGLE_REDIRECT_URI || `${env.APP_URL}/api/google/callback`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleApiError(
      500,
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }

  try {
    const res = await googleApiGateway.request<Record<string, unknown>>({
      apiName: "OAUTH",
      method: "POST",
      url: TOKEN_URL,
      skipRateLimit: true,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(),
        grant_type: "authorization_code",
      }).toString(),
    });
    return normalizeTokenResponse(res.data);
  } catch (err) {
    if (err instanceof GoogleGatewayError) throw GoogleApiError.fromGateway(err);
    throw err;
  }
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<
  Pick<GoogleTokens, "accessToken" | "expiresAt" | "scopes" | "tokenType"> & {
    refreshToken?: string;
  }
> {
  try {
    const res = await googleApiGateway.request<Record<string, unknown>>({
      apiName: "OAUTH",
      method: "POST",
      url: TOKEN_URL,
      skipRateLimit: true,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    return normalizeTokenResponse(res.data);
  } catch (err) {
    if (err instanceof GoogleGatewayError) throw GoogleApiError.fromGateway(err);
    throw err;
  }
}

/**
 * Revoke a grant at Google. Pass the refresh token when available —
 * revoking it also invalidates every access token derived from it.
 *
 * Best-effort by design: the caller has already decided to disconnect, and
 * a token Google has forgotten about returns 400. Never throws, so a
 * revocation failure cannot block the local disconnect.
 */
export async function revokeToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    await googleApiGateway.request({
      apiName: "OAUTH",
      method: "POST",
      url: REVOKE_URL,
      skipRateLimit: true,
      // Already-invalid tokens 400 deterministically; retrying wastes time.
      maxRetries: 0,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    return true;
  } catch (err) {
    logger.warn("Google token revocation failed — continuing with disconnect", {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function normalizeTokenResponse(body: unknown): GoogleTokens {
  const b = body as Record<string, unknown>;
  const access = String(b.access_token ?? "");
  if (!access) {
    throw new GoogleApiError(500, "Google did not return an access_token", undefined, body);
  }
  return {
    accessToken: access,
    refreshToken: typeof b.refresh_token === "string" ? b.refresh_token : "",
    expiresAt: new Date(Date.now() + Number(b.expires_in ?? 3600) * 1000),
    scopes: typeof b.scope === "string" ? b.scope : env.GOOGLE_BUSINESS_SCOPES,
    tokenType: typeof b.token_type === "string" ? b.token_type : "Bearer",
  };
}

// ---------- Concrete client ----------

export class GoogleBusinessClient implements GoogleApiClient {
  private tokens: GoogleTokens;
  private tenantId: string | null;
  private googleAccountDbId: string | null;

  constructor(
    tokens: GoogleTokens,
    opts?: { tenantId?: string | null; googleAccountDbId?: string | null },
  ) {
    this.tokens = tokens;
    this.tenantId = opts?.tenantId ?? null;
    this.googleAccountDbId = opts?.googleAccountDbId ?? null;
  }

  getCurrentTokens(): GoogleTokens {
    return this.tokens;
  }

  async refreshIfExpired(): Promise<void> {
    if (this.tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return;
    }
    if (!this.tokens.refreshToken) {
      throw new GoogleApiError(
        401,
        "Access token expired and no refresh token is available",
      );
    }
    const refreshed = await refreshAccessToken(this.tokens.refreshToken);
    this.tokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || this.tokens.refreshToken,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scopes,
      tokenType: refreshed.tokenType,
    };
    logger.debug("Refreshed Google access token", {
      expiresAt: this.tokens.expiresAt.toISOString(),
    });
  }

  /**
   * Single Google HTTP call via the centralized gateway.
   * Pagination callers must invoke this once per page.
   */
  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    await this.refreshIfExpired();
    try {
      const res = await googleApiGateway.request<T>({
        apiName: detectApiName(url),
        method: init?.method ?? "GET",
        url,
        accessToken: this.tokens.accessToken,
        tenantId: this.tenantId,
        googleAccountId: this.googleAccountDbId,
        headers: (init?.headers as Record<string, string> | undefined) ?? undefined,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return res.data;
    } catch (err) {
      if (err instanceof GoogleGatewayError) {
        throw GoogleApiError.fromGateway(err);
      }
      throw err;
    }
  }

  async getUserInfo(): Promise<GoogleUserinfo> {
    return this.request<GoogleUserinfo>(USERINFO_URL);
  }

  async listAccounts(): Promise<GoogleAccountResource[]> {
    const out: GoogleAccountResource[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${ACCOUNT_MGMT_URL}/accounts`);
      url.searchParams.set("pageSize", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await this.request<{
        accounts?: GoogleAccountResource[];
        nextPageToken?: string;
      }>(url.toString());
      out.push(...(res.accounts ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return out;
  }

  async listLocations(accountName: string): Promise<GoogleLocationResource[]> {
    const out: GoogleLocationResource[] = [];
    let pageToken: string | undefined;
    const readMask =
      "name,title,storeCode,storefrontAddress,phoneNumbers,categories,websiteUri,metadata,languageCode";
    do {
      const url = new URL(`${BUSINESS_INFO_URL}/${accountName}/locations`);
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("readMask", readMask);
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await this.request<{
        locations?: GoogleLocationResource[];
        nextPageToken?: string;
      }>(url.toString());
      out.push(...(res.locations ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return out;
  }

  async listReviews(locationResourceName: string): Promise<unknown[]> {
    const out: unknown[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(
        `${LEGACY_MY_BUSINESS_URL}/${locationResourceName}/reviews`,
      );
      url.searchParams.set("pageSize", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await this.request<{
        reviews?: unknown[];
        nextPageToken?: string;
      }>(url.toString());
      out.push(...(res.reviews ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return out;
  }
}
