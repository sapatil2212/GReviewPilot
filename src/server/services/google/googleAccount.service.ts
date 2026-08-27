/**
 * Google Business account service.
 *
 * Orchestrates the OAuth connect flow, disconnect, token refresh, and
 * status queries. Uses `GoogleBusinessClient` for outbound calls and
 * `googleAccountRepository` for persistence. Tokens are encrypted
 * before persisting and decrypted just-in-time.
 */

import { AuditAction, GoogleAccountStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  GoogleApiError,
  GoogleBusinessClient,
  hasBusinessScope,
  missingScopes,
  REQUIRED_BUSINESS_SCOPE,
  revokeToken,
  type GoogleTokens,
} from "./googleClient";
import {
  operatorRemediation,
  requiresReconnect,
} from "@/server/google/gateway/errorClassifier";
import { auditRepository } from "@/server/repositories/audit.repository";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { decrypt, encrypt, signPayload, verifySignedPayload } from "@/server/utils/crypto";
import {
  cronEnabled,
  env,
  googleAuthEnabled,
  googleRedirectUri,
} from "@/server/utils/env";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";
import type { OauthState } from "@/server/validators/google.schema";
import type { AuthContext } from "@/server/auth/requireSession";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

/**
 * Decrypt a stored token without throwing.
 *
 * `decrypt` rejects anything whose auth tag does not verify, which happens
 * whenever ENCRYPTION_KEY (or the AUTH_SECRET it is derived from) changes, or
 * when a database dump is restored into a differently-keyed environment. The
 * stored token is unrecoverable at that point; callers treat an empty string
 * as "needs reconnect" rather than crashing the request.
 */
function safeDecrypt(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return "";
  }
}

export const googleAccountService = {
  isConfigured(): boolean {
    return googleAuthEnabled;
  },

  /**
   * Return the connection status for the caller's tenant.
   * Does not include tokens.
   */
  async getStatus(ctx: AuthContext) {
    const account = await googleAccountRepository.findByTenantId(ctx.tenantId);
    return {
      configured: googleAuthEnabled,
      redirectUri: googleRedirectUri,
      account: account
        ? {
            id: account.id,
            email: account.email,
            googleAccountId: account.googleAccountId,
            googleAccountName: account.googleAccountName,
            status: account.status,
            scopes: account.scopes,
            // Lets the dashboard distinguish "needs reconnect because the
            // token expired" from "needs reconnect because the Business
            // Profile permission was never granted".
            hasBusinessScope: hasBusinessScope(account.scopes),
            expiresAt: account.expiresAt,
            lastSyncedAt: account.lastSyncedAt,
            lastSyncError: account.lastSyncError,
            connectedAt: account.createdAt,
            connectedBy: account.connectedBy,
          }
        : null,
    };
  },

  /**
   * Static configuration audit for the Google integration.
   *
   * Everything here is checkable without calling Google, and every item maps
   * to a failure that is otherwise only visible as an opaque Google error
   * page: a redirect URI that does not match the OAuth client, a missing
   * business scope, an auto-sync that never runs because CRON_SECRET is unset.
   *
   * Returns findings rather than throwing so the diagnostics endpoint can show
   * all of them at once.
   */
  configCheck(): {
    ok: boolean;
    redirectUri: string;
    redirectUriExplicit: boolean;
    findings: Array<{
      level: "error" | "warning";
      key: string;
      message: string;
    }>;
  } {
    const findings: Array<{
      level: "error" | "warning";
      key: string;
      message: string;
    }> = [];

    if (!googleAuthEnabled) {
      findings.push({
        level: "error",
        key: "GOOGLE_CLIENT_ID",
        message:
          "Google OAuth is disabled — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      });
    }

    const redirectUriExplicit = Boolean(env.GOOGLE_REDIRECT_URI);
    const redirectUri = googleRedirectUri;

    if (!redirectUriExplicit) {
      findings.push({
        level: "warning",
        key: "GOOGLE_REDIRECT_URI",
        message:
          `Derived from APP_URL as ${redirectUri}. Set it explicitly and register the ` +
          "exact same value as an Authorized redirect URI on the OAuth client.",
      });
    }

    // Google compares the redirect URI as an exact string. A redirect URI on a
    // different host than APP_URL is legal but almost always a leftover from a
    // domain change, and it breaks the callback with redirect_uri_mismatch.
    try {
      const appHost = new URL(env.APP_URL).host;
      const redirectHost = new URL(redirectUri).host;
      if (appHost !== redirectHost) {
        findings.push({
          level: "warning",
          key: "GOOGLE_REDIRECT_URI",
          message:
            `Redirect URI host (${redirectHost}) differs from APP_URL host (${appHost}). ` +
            "Google will reject the callback unless this exact URI is registered.",
        });
      }
    } catch {
      findings.push({
        level: "error",
        key: "GOOGLE_REDIRECT_URI",
        message: "Redirect URI is not a parseable absolute URL.",
      });
    }

    if (!redirectUri.endsWith("/api/google/callback")) {
      findings.push({
        level: "error",
        key: "GOOGLE_REDIRECT_URI",
        message:
          "Redirect URI must end with /api/google/callback — that is the only route " +
          "that handles the OAuth response.",
      });
    }

    if (!hasBusinessScope(env.GOOGLE_BUSINESS_SCOPES)) {
      findings.push({
        level: "error",
        key: "GOOGLE_BUSINESS_SCOPES",
        message: `Missing ${REQUIRED_BUSINESS_SCOPE} — no Business Profile call can succeed.`,
      });
    }

    if (!env.ENCRYPTION_KEY) {
      findings.push({
        level: "warning",
        key: "ENCRYPTION_KEY",
        message:
          "Not set — token encryption keys are derived from AUTH_SECRET, so rotating " +
          "AUTH_SECRET will make stored Google tokens unreadable and force every tenant " +
          "to reconnect.",
      });
    }

    if (!cronEnabled) {
      findings.push({
        level: "warning",
        key: "CRON_SECRET",
        message:
          "Not set — /api/cron/auto-sync and /api/cron/google-sync-worker return 503, so " +
          "queued sync jobs are only processed when a user triggers a sync manually.",
      });
    }

    return {
      ok: !findings.some((f) => f.level === "error"),
      redirectUri,
      redirectUriExplicit,
      findings,
    };
  },

  /**
   * Live reachability probe against the Account Management API for a tenant's
   * connected account.
   *
   * This is the only way to distinguish "the Cloud project is not enabled or
   * allowlisted for the Business Profile APIs" from "this user has no
   * profiles" — both look like an empty location list otherwise. It spends one
   * quota unit, so it is only ever run when an admin explicitly asks.
   */
  async probe(tenantId: string): Promise<{
    reachable: boolean;
    accountCount: number | null;
    category: string | null;
    remediation: string | null;
    detail: string | null;
  }> {
    try {
      const { client } = await this.getClient(tenantId);
      const accounts = await client.listAccounts();
      return {
        reachable: true,
        accountCount: accounts.length,
        category: null,
        remediation: null,
        detail:
          accounts.length === 0
            ? "Reachable, but this Google account does not manage any Business Profiles."
            : null,
      };
    } catch (err) {
      const category =
        err instanceof GoogleApiError && err.category ? err.category : null;
      return {
        reachable: false,
        accountCount: null,
        category,
        remediation: category ? operatorRemediation(category) : null,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },

  /**
   * Build the Google consent URL for this tenant + user. Returns null
   * if Google OAuth is not configured — the route handler surfaces a
   * clear error in that case.
   */
  buildConnectUrl(ctx: AuthContext): string {
    if (!googleAuthEnabled) {
      throw new ValidationError(
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      );
    }
    const state: OauthState = {
      tid: ctx.tenantId,
      uid: ctx.userId,
      nonce: randomBytes(16).toString("hex"),
      exp: Math.floor((Date.now() + STATE_TTL_MS) / 1000),
    };
    return buildAuthUrl(signPayload(state));
  },

  /**
   * Verify state token from Google's callback. Returns the decoded
   * payload or throws.
   */
  verifyState(stateToken: string): OauthState {
    const payload = verifySignedPayload<OauthState>(stateToken);
    if (!payload) throw new ForbiddenError("Invalid OAuth state");
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenError("OAuth state expired — restart the flow");
    }
    return payload;
  },

  /**
   * Called from the OAuth callback route. Exchanges the code, upserts
   * the GoogleAccount row (encrypted tokens), records audit, and
   * queues ACCOUNT discovery — does NOT block on Google list APIs.
   */
  async completeOAuth(state: OauthState, code: string, req: Request) {
    const tokens = await exchangeCodeForTokens(code);

    // Google issues a valid token even when the user unticks the Business
    // Profile checkbox on the consent screen. Storing that token would look
    // like a successful connection and then fail on every sync, so refuse it
    // here while the user is still in the flow and can just try again.
    if (!hasBusinessScope(tokens.scopes)) {
      logger.warn("Google connect rejected — business.manage not granted", {
        tenantId: state.tid,
        granted: tokens.scopes,
        missing: missingScopes(tokens.scopes),
      });
      // The grant we just received is useless; don't leave it on the account.
      await revokeToken(tokens.refreshToken || tokens.accessToken);
      throw new ValidationError(
        "Google Business Profile access was not granted. Please connect again and " +
          "leave the Business Profile permission checked — without it we cannot read " +
          "your locations or reviews.",
      );
    }

    const client = new GoogleBusinessClient(tokens, { tenantId: state.tid });
    const info = await client.getUserInfo().catch((err) => {
      logger.warn("Google userinfo failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      throw new GoogleApiError(500, "Failed to fetch Google user profile");
    });

    if (!info.email) {
      throw new ValidationError("Google did not return an email address");
    }

    // Background sync is impossible without a refresh token. Google omits it
    // when the account has an existing grant, so an empty value here must
    // never overwrite a refresh token we already hold — encrypting "" and
    // writing it would silently break every future sync for this tenant.
    let refreshToken: string | undefined;
    if (tokens.refreshToken) {
      refreshToken = encrypt(tokens.refreshToken);
    } else {
      const existing = await googleAccountRepository.findByTenantAndEmail(
        state.tid,
        info.email,
      );
      if (!existing?.refreshToken) {
        logger.warn("Google connect returned no refresh token", {
          tenantId: state.tid,
        });
        throw new ValidationError(
          "Google did not return offline access for this account. Remove GReviewPilot " +
            "from your Google account permissions, then connect again.",
        );
      }
      logger.info("Reusing stored Google refresh token", {
        tenantId: state.tid,
      });
    }

    // Do NOT call listAccounts / initialSync here — that exhausts
    // Account Management quota during the OAuth redirect. Queue instead.
    const account = await googleAccountRepository.upsert({
      tenantId: state.tid,
      email: info.email,
      accessToken: encrypt(tokens.accessToken),
      refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      connectedById: state.uid,
      googleAccountId: null,
      googleAccountName: null,
    });

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.GOOGLE_ACCOUNT_CONNECTED,
      userId: state.uid,
      tenantId: state.tid,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        email: info.email,
        scopes: tokens.scopes,
      },
    });

    const { syncJobService } = await import("@/server/google/sync/syncJob.service");
    const { SyncKind } = await import("@prisma/client");
    await syncJobService.enqueue({
      tenantId: state.tid,
      googleAccountId: account.id,
      kind: SyncKind.ACCOUNTS,
      triggeredById: state.uid,
      priority: 10,
      delayMs: 250 + Math.floor(Math.random() * 1000),
      metadata: { source: "oauth_connect" },
    });

    return account;
  },

  async disconnect(ctx: AuthContext, req: Request) {
    const account = await googleAccountRepository.findByTenantId(ctx.tenantId);
    if (!account) throw new NotFoundError("No Google account connected");

    // Tell Google to drop the grant too. Deleting only our row leaves the app
    // listed under the user's Google account permissions indefinitely, which
    // is both a privacy problem and confusing on reconnect. Revoking the
    // refresh token also invalidates every access token derived from it.
    // Best-effort: a failure here must not block the local disconnect.
    const revoked = await revokeToken(safeDecrypt(account.refreshToken)).catch(
      () => false,
    );

    await googleAccountRepository.disconnect(account.id);

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: AuditAction.GOOGLE_ACCOUNT_DISCONNECTED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        googleAccountId: account.googleAccountId,
        email: account.email,
        revokedAtGoogle: revoked,
      },
    });

    return { disconnected: account.id, revokedAtGoogle: revoked };
  },

  /**
   * Load the connected account for this tenant and return a Google API
   * client with decrypted tokens ready for use. Persists refreshed
   * tokens back to the DB automatically.
   *
   * Used by sync services (locations, reviews, posts, etc).
   */
  async getClient(tenantId: string): Promise<{
    account: NonNullable<Awaited<ReturnType<typeof googleAccountRepository.findConnectedByTenantId>>>;
    client: GoogleBusinessClient;
  }> {
    const account =
      await googleAccountRepository.findConnectedByTenantId(tenantId);
    if (!account) {
      throw new ConflictError(
        "CONFLICT",
        "No Google Business account is connected to this workspace",
      );
    }

    const tokens: GoogleTokens = {
      accessToken: safeDecrypt(account.accessToken),
      refreshToken: safeDecrypt(account.refreshToken),
      expiresAt: account.expiresAt,
      scopes: account.scopes,
      tokenType: account.tokenType,
    };

    // Undecryptable tokens mean the encryption key no longer matches what
    // wrote them. Nothing can recover them, so ask for a reconnect instead of
    // letting every sync fail with an opaque cipher error.
    if (!tokens.accessToken && !tokens.refreshToken) {
      await googleAccountRepository.updateStatus(
        account.id,
        GoogleAccountStatus.REAUTH_REQUIRED,
        "Stored Google credentials could not be read. Please reconnect.",
      );
      logger.error("Google tokens failed to decrypt — ENCRYPTION_KEY mismatch", {
        tenantId,
        googleAccountDbId: account.id,
      });
      throw new ConflictError(
        "CONFLICT",
        "Stored Google credentials could not be read. Please reconnect your Google account.",
      );
    }

    // Refusing here keeps a scope-less connection from burning quota on calls
    // that are guaranteed to 403.
    if (!hasBusinessScope(account.scopes)) {
      await googleAccountRepository.updateStatus(
        account.id,
        GoogleAccountStatus.REAUTH_REQUIRED,
        `Missing required Google permission (${REQUIRED_BUSINESS_SCOPE}). Please reconnect.`,
      );
      throw new ConflictError(
        "CONFLICT",
        "Your Google connection is missing Business Profile access. Please reconnect and keep the Business Profile permission checked.",
      );
    }

    const client = new GoogleBusinessClient(tokens, {
      tenantId,
      googleAccountDbId: account.id,
    });

    // Refresh lock — prevent concurrent workers from refreshing the same token.
    const { syncLockService, syncLockKey } = await import(
      "@/server/google/sync/syncLock.service"
    );
    const refreshKey = syncLockKey({
      tenantId,
      googleAccountId: account.id,
      kind: "token-refresh",
    });
    const lock = await syncLockService.acquire(refreshKey, 30);

    try {
      await client.refreshIfExpired().catch(async (err) => {
        // Match on category, not status. A revoked or expired refresh token
        // comes back as HTTP 400 `invalid_grant`, so a status===401 check
        // never fired and the account stayed CONNECTED — auto-sync then
        // retried it every interval forever instead of asking the user to
        // reconnect once.
        if (
          err instanceof GoogleApiError &&
          (err.status === 401 ||
            (err.category && requiresReconnect(err.category)))
        ) {
          await googleAccountRepository.updateStatus(
            account.id,
            GoogleAccountStatus.REAUTH_REQUIRED,
            "Your Google connection needs to be reauthorized.",
          );
        }
        throw err;
      });

      const current = client.getCurrentTokens();
      if (current.accessToken !== tokens.accessToken) {
        await googleAccountRepository.updateTokens(account.id, {
          accessToken: encrypt(current.accessToken),
          refreshToken: current.refreshToken
            ? encrypt(current.refreshToken)
            : undefined,
          expiresAt: current.expiresAt,
          scopes: current.scopes,
        });
        await auditRepository.record({
          action: AuditAction.GOOGLE_TOKEN_REFRESHED,
          tenantId,
          metadata: { googleAccountId: account.googleAccountId },
        });
      }
    } finally {
      if (lock.acquired && lock.ownerId) {
        await syncLockService.release(refreshKey, lock.ownerId);
      }
    }

    return { account, client };
  },
};
