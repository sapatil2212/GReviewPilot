/**
 * HTTP-01 challenge storage.
 *
 * During issuance the CA fetches
 * `http://<domain>/.well-known/acme-challenge/<token>` and expects the key
 * authorization back. This app answers that request itself — nginx proxies the
 * path through rather than serving it from a webroot — which keeps issuance
 * working without giving the web server write access to a shared directory, and
 * means the flow is identical whether one app instance is running or several.
 *
 * Tokens are single-purpose and short-lived. They are the only secret in the
 * exchange, so rows are deleted as soon as the challenge is settled and swept
 * on expiry if issuance was abandoned partway.
 */

import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/utils/logger";

/**
 * How long a stored token stays usable.
 *
 * Comfortably longer than a normal order (seconds) but short enough that an
 * abandoned one cannot linger. The CA retries validation for a few minutes, so
 * anything under that risks failing a slow-but-recoverable order.
 */
const TTL_MS = 30 * 60 * 1000;

export const acmeChallengeStore = {
  /** Record a challenge response for the CA to collect. */
  async put(token: string, keyAuthorization: string, hostname: string): Promise<void> {
    const expiresAt = new Date(Date.now() + TTL_MS);
    // Upsert rather than create: a retried order can reissue the same token,
    // and a unique-constraint failure there would abort issuance needlessly.
    await prisma.acmeChallenge.upsert({
      where: { token },
      create: { token, keyAuthorization, hostname, expiresAt },
      update: { keyAuthorization, hostname, expiresAt },
    });
    logger.debug("ACME challenge stored", { hostname, token: token.slice(0, 8) });
  },

  /** Resolve a token to its key authorization, or null when absent/expired. */
  async get(token: string): Promise<string | null> {
    const row = await prisma.acmeChallenge.findUnique({ where: { token } });
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) {
      // Expired tokens are treated as absent and cleaned up opportunistically.
      await prisma.acmeChallenge.deleteMany({ where: { token } }).catch(() => undefined);
      return null;
    }
    return row.keyAuthorization;
  },

  /**
   * Remove a settled challenge. Never throws — cleanup must not fail issuance.
   *
   * `deleteMany` rather than `delete` because this is called on every challenge
   * teardown, including ones already removed. `delete` raises (and Prisma logs)
   * a "record not found" error in that case, which would fill the logs with
   * failures during entirely normal operation.
   */
  async remove(token: string): Promise<void> {
    await prisma.acmeChallenge.deleteMany({ where: { token } }).catch(() => undefined);
  },

  /** Drop expired rows. Called by the SSL monitor so no separate job is needed. */
  async sweep(): Promise<number> {
    const result = await prisma.acmeChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      logger.debug("Swept expired ACME challenges", { count: result.count });
    }
    return result.count;
  },
};
