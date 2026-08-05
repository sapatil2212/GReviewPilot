/**
 * Session lifecycle service.
 *
 * The database `UserSession` row is the source of truth for whether a
 * session is still valid — the JWT cookie only carries an opaque `jti`.
 * On every server-side auth check we look the session up by
 * SHA-256(jti) and re-verify user/tenant status.
 *
 * Timeouts:
 *   - default session:  7 days absolute
 *   - remember-me:     30 days absolute
 *   - idle (implicit): 30 min (enforced by rotation window + touch)
 *
 * Rotation happens when < 24h remain on a session; the client sees a
 * new cookie transparently.
 */

import { randomBytes } from "node:crypto";
import type { UserSession } from "@prisma/client";
import { sha256 } from "@/server/utils/hash";
import { sessionRepository } from "@/server/repositories/session.repository";
import { extractRequestContext, type RequestContext } from "@/server/middleware/requestContext";
import { auditRepository } from "@/server/repositories/audit.repository";
import { AuditAction } from "@prisma/client";
import { emailService } from "@/server/email/email.service";
import { logger } from "@/server/utils/logger";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export interface CreateSessionOptions {
  userId: string;
  tenantId: string;
  rememberMe?: boolean;
  request?: Request | Headers | null;
  notifyNewDeviceEmail?: string;
  notifyNewDeviceFirstName?: string;
}

export interface CreatedSession {
  session: UserSession;
  /** Raw jti to embed in the JWT. Never persisted; hash is stored. */
  jti: string;
  expiresAt: Date;
}

function newJti(): string {
  return randomBytes(32).toString("base64url");
}

function ttlMs(rememberMe: boolean | undefined): number {
  return rememberMe ? REMEMBER_ME_TTL_MS : DEFAULT_TTL_MS;
}

export const sessionService = {
  /** Create a fresh session row + return the raw jti for the JWT. */
  async create(opts: CreateSessionOptions): Promise<CreatedSession> {
    const jti = newJti();
    const jtiHash = sha256(jti);
    const expiresAt = new Date(Date.now() + ttlMs(opts.rememberMe));

    const ctx: RequestContext = opts.request
      ? extractRequestContext(opts.request)
      : { ipAddress: null, userAgent: null, browser: null, os: null, device: null };

    const session = await sessionRepository.create({
      user: { connect: { id: opts.userId } },
      tenant: { connect: { id: opts.tenantId } },
      sessionTokenHash: jtiHash,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      browser: ctx.browser,
      os: ctx.os,
      device: ctx.device,
      expiresAt,
    });

    await auditRepository.record({
      action: AuditAction.SESSION_CREATED,
      userId: opts.userId,
      tenantId: opts.tenantId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      browser: ctx.browser,
      device: ctx.device,
    });

    // Notify on new device login (best-effort, don't block).
    if (opts.notifyNewDeviceEmail) {
      void emailService.sendNewDeviceLoginEmail({
        to: opts.notifyNewDeviceEmail,
        firstName: opts.notifyNewDeviceFirstName,
        browser: ctx.browser,
        os: ctx.os,
        ipAddress: ctx.ipAddress,
      });
    }

    return { session, jti, expiresAt };
  },

  /**
   * Look up a session by its jti (from a JWT). Enforces all validity
   * rules — inactive, expired, idle-timed-out sessions return null.
   */
  async validateByJti(jti: string): Promise<UserSession | null> {
    if (!jti) return null;
    const hash = sha256(jti);
    const session = await sessionRepository.findByTokenHash(hash);
    if (!session) return null;
    if (!session.isActive) return null;
    if (session.expiresAt <= new Date()) return null;

    const idleFor = Date.now() - session.lastActivityAt.getTime();
    if (idleFor > IDLE_TIMEOUT_MS) {
      await sessionRepository.revoke(session.id, "IDLE_TIMEOUT");
      return null;
    }
    return session;
  },

  /**
   * Return a new jti if the session should be rotated (near expiry
   * or on demand), otherwise null. Caller re-issues the cookie.
   */
  async maybeRotate(session: UserSession): Promise<{ jti: string; expiresAt: Date } | null> {
    const remaining = session.expiresAt.getTime() - Date.now();
    if (remaining > ROTATION_WINDOW_MS) return null;

    const jti = newJti();
    const jtiHash = sha256(jti);
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);
    await sessionRepository.rotate(session.id, jtiHash, expiresAt);
    await auditRepository.record({
      action: AuditAction.SESSION_REFRESHED,
      userId: session.userId,
      tenantId: session.tenantId,
    });
    return { jti, expiresAt };
  },

  /** Throttled activity touch — called from the guard on each request. */
  async touch(session: UserSession): Promise<void> {
    const stale = Date.now() - session.lastActivityAt.getTime() > 60_000;
    if (!stale) return;
    try {
      await sessionRepository.touchActivity(session.id);
    } catch (err) {
      logger.warn("touch session failed", { err: String(err) });
    }
  },

  async revoke(sessionId: string, reason: string) {
    return sessionRepository.revoke(sessionId, reason);
  },

  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
    return sessionRepository.revokeAllForUser(userId, reason, exceptSessionId);
  },

  listActiveForUser(userId: string) {
    return sessionRepository.listActiveForUser(userId);
  },
};
