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
  type GoogleTokens,
} from "./googleClient";
import { auditRepository } from "@/server/repositories/audit.repository";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { decrypt, encrypt, signPayload, verifySignedPayload } from "@/server/utils/crypto";
import { env, googleAuthEnabled } from "@/server/utils/env";
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
      redirectUri: env.GOOGLE_REDIRECT_URI || `${env.APP_URL}/api/google/callback`,
      account: account
        ? {
            id: account.id,
            email: account.email,
            googleAccountId: account.googleAccountId,
            googleAccountName: account.googleAccountName,
            status: account.status,
            scopes: account.scopes,
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
   * the GoogleAccount row (encrypted tokens), and records audit.
   */
  async completeOAuth(state: OauthState, code: string, req: Request) {
    const tokens = await exchangeCodeForTokens(code);

    // Immediately probe /userinfo so we know which Google identity
    // just authenticated. Also gives us a chance to list accounts.
    const client = new GoogleBusinessClient(tokens);
    const info = await client.getUserInfo().catch((err) => {
      logger.warn("Google userinfo failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      throw new GoogleApiError(500, "Failed to fetch Google user profile");
    });

    if (!info.email) {
      throw new ValidationError("Google did not return an email address");
    }

    // Try to grab an account id (business.manage might not include it
    // for some users; sync will retry later).
    let googleAccountId: string | null = null;
    let googleAccountName: string | null = null;
    try {
      const accounts = await client.listAccounts();
      const first = accounts[0];
      if (first) {
        googleAccountId = first.name;
        googleAccountName = first.accountName ?? null;
      }
    } catch (err) {
      logger.info("listAccounts failed at connect time — will retry on sync", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    const account = await googleAccountRepository.upsert({
      tenantId: state.tid,
      email: info.email,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      connectedById: state.uid,
      googleAccountId,
      googleAccountName,
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
        googleAccountId,
        email: info.email,
        scopes: tokens.scopes,
      },
    });

    return account;
  },

  async disconnect(ctx: AuthContext, req: Request) {
    const account = await googleAccountRepository.findByTenantId(ctx.tenantId);
    if (!account) throw new NotFoundError("No Google account connected");

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
      metadata: { googleAccountId: account.googleAccountId, email: account.email },
    });

    return { disconnected: account.id };
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
      accessToken: decrypt(account.accessToken),
      refreshToken: decrypt(account.refreshToken),
      expiresAt: account.expiresAt,
      scopes: account.scopes,
      tokenType: account.tokenType,
    };
    const client = new GoogleBusinessClient(tokens);
    await client.refreshIfExpired().catch(async (err) => {
      if (err instanceof GoogleApiError && err.status === 401) {
        await googleAccountRepository.updateStatus(
          account.id,
          GoogleAccountStatus.TOKEN_EXPIRED,
          err.message,
        );
      }
      throw err;
    });

    const current = client.getCurrentTokens();
    // Persist if the client refreshed.
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

    return { account, client };
  },
};
