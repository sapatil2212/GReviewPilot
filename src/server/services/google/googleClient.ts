/**
 * Google Business Profile API client.
 *
 * Wraps the OAuth 2.0 token exchange plus the specific REST endpoints
 * we consume (accounts, locations, reviews, posts, media, Q&A). The
 * class holds a mutable token snapshot; when the access token is
 * within `TOKEN_REFRESH_MARGIN_MS` of expiry, we transparently refresh
 * via the stored refresh token and expose the new tokens through
 * `getCurrentTokens()` so the caller can persist them.
 *
 * Kept behind an interface (`GoogleApiClient`) so future modules
 * (Reviews, Posts) can inject a mock in unit tests without hitting
 * live Google endpoints.
 */

import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

// Business Profile API base URLs (v1 replaced legacy v4 for most reads).
const ACCOUNT_MGMT_URL = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_URL =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const LEGACY_MY_BUSINESS_URL = "https://mybusiness.googleapis.com/v4"; // still used for reviews

const TOKEN_REFRESH_MARGIN_MS = 60 * 1000; // refresh 1min before expiry

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
  name: string; // "accounts/{account_id}"
  accountName: string;
  type?: string;
  role?: string;
  verificationState?: string;
  vettedState?: string;
}

export interface GoogleLocationResource {
  name: string; // "locations/{location_id}" or full "accounts/{a}/locations/{l}"
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

// ---------- Errors ----------

export class GoogleApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;
  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// ---------- Static helpers ----------

/**
 * Build the consent URL Google redirects the user through. The `state`
 * value is opaque to Google and returned untouched on callback.
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: env.GOOGLE_BUSINESS_SCOPES,
    access_type: "offline",
    prompt: "consent", // ensure we always get a refresh_token
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function googleRedirectUri(): string {
  return env.GOOGLE_REDIRECT_URI || `${env.APP_URL}/api/google/callback`;
}

/**
 * Exchange an authorization code for an access + refresh token pair.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleApiError(
      500,
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  const raw = await res.text();
  const body = safeJson(raw);
  if (!res.ok) {
    throw new GoogleApiError(
      res.status,
      pickError(body) ?? "Token exchange failed",
      pickErrorCode(body),
      body,
    );
  }
  return normalizeTokenResponse(body);
}

/**
 * Refresh an expired access token. Google rarely returns a new refresh
 * token here — reuse the existing one when absent.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<Pick<GoogleTokens, "accessToken" | "expiresAt" | "scopes" | "tokenType"> & {
  refreshToken?: string;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const raw = await res.text();
  const body = safeJson(raw);
  if (!res.ok) {
    throw new GoogleApiError(
      res.status,
      pickError(body) ?? "Refresh failed",
      pickErrorCode(body),
      body,
    );
  }
  return normalizeTokenResponse(body);
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
    expiresAt: new Date(
      Date.now() + Number(b.expires_in ?? 3600) * 1000,
    ),
    scopes: typeof b.scope === "string" ? b.scope : env.GOOGLE_BUSINESS_SCOPES,
    tokenType: typeof b.token_type === "string" ? b.token_type : "Bearer",
  };
}

function pickError(body: unknown): string | null {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error_description === "string") return b.error_description;
    if (typeof b.error === "string") return b.error;
    const inner = b.error as Record<string, unknown> | undefined;
    if (inner && typeof inner.message === "string") return inner.message;
  }
  return null;
}

function pickErrorCode(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    const inner = b.error as Record<string, unknown> | undefined;
    if (inner && typeof inner.status === "string") return inner.status;
  }
  return undefined;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ---------- Concrete client ----------

export class GoogleBusinessClient implements GoogleApiClient {
  private tokens: GoogleTokens;

  constructor(tokens: GoogleTokens) {
    this.tokens = tokens;
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

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    await this.refreshIfExpired();
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    const body = text.length > 0 ? safeJson(text) : {};
    if (!res.ok) {
      throw new GoogleApiError(
        res.status,
        pickError(body) ?? `${res.status} ${res.statusText}`,
        pickErrorCode(body),
        body,
      );
    }
    return body as T;
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
    // Legacy v4 endpoint — no v1 equivalent yet.
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
