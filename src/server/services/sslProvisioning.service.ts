/**
 * End-to-end certificate provisioning — for tenant custom domains AND for the
 * platform's own hostname (APP_URL).
 *
 * The platform needs the same thing a tenant domain needs: a certificate over
 * ACME, an nginx server block that uses it, a reload. `issueOrReuseCertificate`
 * is that mechanism, with no knowledge of `SiteDomain` rows, so it works
 * identically for both. `provisionCertificate` (tenant) and
 * `provisionPlatformHostname` (platform) are thin wrappers that add their
 * respective preconditions and, for tenants, persist status onto the domain row.
 * One mechanism, two call sites — a second implementation would drift and
 * eventually renew one but not the other.
 *
 * A no-op unless SSL_PROVISIONING=nginx. On a managed host (Vercel, Cloudflare)
 * the platform issues certificates itself and this code stays out of the way —
 * the monitor in sslMonitor.service.ts still reports on them either way.
 */

import { Resolver } from "node:dns/promises";
import { SiteDomainStatus, SiteSslStatus, type SiteDomain } from "@prisma/client";
import { siteDomainRepository } from "@/server/repositories/siteDomain.repository";
import { checkCaa } from "@/server/services/siteDomain.service";
import {
  CertificateIssuanceError,
  certificatePaths,
  issueCertificate,
  readCertificateOnDisk,
} from "@/server/services/acme/certificateIssuer.service";
import { nginxManager } from "@/server/services/nginx/nginxManager.service";
import { RENEWAL_WARNING_DAYS } from "@/server/services/tlsCertificate.service";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

export interface ProvisionResult {
  hostname: string;
  /** What actually happened, for logs and the API response. */
  action: "issued" | "renewed" | "reused" | "skipped" | "failed";
  reason: string;
  notAfter: Date | null;
  staging: boolean;
}

/** True when provisioning is this app's job at all. */
export function provisioningEnabled(): boolean {
  return env.SSL_PROVISIONING === "nginx";
}

/**
 * In-flight issuance, keyed by hostname.
 *
 * Two things can ask for the same certificate at once: a tenant pressing Verify
 * while the hourly sweep is running, an impatient double-click, or the platform's
 * own provisioning racing the sweep. Without this, both submit an ACME order and
 * both count against Let's Encrypt's per-domain weekly limit — five of which
 * locks the domain out of HTTPS for a week. Callers join the existing attempt
 * instead of starting a second one.
 *
 * Process-local, which is sufficient here: a second app instance would need a
 * database lock, but the CA's own duplicate-order handling makes that a
 * rate-limit inefficiency rather than a correctness problem.
 */
const inFlight = new Map<string, Promise<ProvisionResult>>();

/**
 * Days before expiry at which we replace a certificate.
 *
 * Let's Encrypt certificates last 90 days and their own advice is to renew at
 * 30. Renewing on the same schedule as the warning window means a certificate
 * that fails to renew still has three weeks of alerts before visitors are
 * affected, rather than failing silently until the day it expires.
 */
const RENEW_WITHIN_DAYS = 30;

function daysUntil(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Core issuance: CAA check, reuse-or-issue, nginx vhost. No database writes —
 * callers own persistence for whatever the hostname represents to them.
 */
async function issueOrReuseCertificateUncoordinated(
  hostname: string,
  options: { redirectTo?: string | null; force?: boolean } = {},
): Promise<ProvisionResult> {
  const staging = env.ACME_DIRECTORY !== "production";
  const skip = (reason: string): ProvisionResult => ({
    hostname,
    action: "skipped",
    reason,
    notAfter: null,
    staging,
  });

  if (!provisioningEnabled()) {
    return skip("Provisioning is disabled (SSL_PROVISIONING is not 'nginx').");
  }

  const caa = await checkCaa(hostname).catch(() => null);
  if (caa && !caa.permitted) {
    return {
      hostname,
      action: "failed",
      reason: caa.message ?? "CAA records block certificate issuance.",
      notAfter: null,
      staging,
    };
  }

  // Reuse what is already on disk when it has plenty of life left. Read from the
  // filesystem rather than the database so a restored backup or a manually
  // replaced certificate is respected.
  const existing = await readCertificateOnDisk(hostname);
  const remaining = existing ? daysUntil(existing.notAfter) : null;
  const needsWork =
    options.force === true || existing === null || (remaining !== null && remaining <= RENEW_WITHIN_DAYS);

  if (!needsWork && existing) {
    // Still make sure nginx knows about it — the certificate can outlive a vhost
    // that was removed by hand or lost when the box was rebuilt.
    const { certPath, keyPath } = certificatePaths(hostname);
    await nginxManager.install({ hostname, certPath, keyPath, redirectTo: options.redirectTo ?? null });
    return {
      hostname,
      action: "reused",
      reason: `Certificate is valid for another ${remaining} days.`,
      notAfter: existing.notAfter,
      staging,
    };
  }

  const renewing = existing !== null;

  try {
    const issued = await issueCertificate(hostname);
    await nginxManager.install({
      hostname,
      certPath: issued.certPath,
      keyPath: issued.keyPath,
      redirectTo: options.redirectTo ?? null,
    });

    return {
      hostname,
      action: renewing ? "renewed" : "issued",
      reason: issued.staging
        ? "Issued from the staging directory (not browser-trusted)."
        : `Certificate issued by ${issued.issuer ?? "the CA"}.`,
      notAfter: issued.notAfter,
      staging: issued.staging,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof CertificateIssuanceError ? err.retryable : true;
    logger.error("Provisioning failed", { hostname, retryable, message });
    return { hostname, action: "failed", reason: message, notAfter: existing?.notAfter ?? null, staging };
  }
}

/** Dedup wrapper shared by the tenant and platform entry points. */
function issueOrReuseCertificate(
  hostname: string,
  options: { redirectTo?: string | null; force?: boolean } = {},
): Promise<ProvisionResult> {
  const existingAttempt = inFlight.get(hostname);
  if (existingAttempt) {
    logger.debug("Joining in-flight provisioning", { hostname });
    return existingAttempt;
  }
  const attempt = issueOrReuseCertificateUncoordinated(hostname, options).finally(() => {
    inFlight.delete(hostname);
  });
  inFlight.set(hostname, attempt);
  return attempt;
}

// =====================================================================
// Tenant custom domains
// =====================================================================

/**
 * Ensure a tenant's `SiteDomain` has a working certificate and an nginx vhost,
 * and persist the outcome onto the row.
 *
 * Idempotent: safe to call on every verification and on every scheduled run.
 */
export async function provisionCertificate(
  domain: SiteDomain,
  options: { force?: boolean } = {},
): Promise<ProvisionResult> {
  const hostname = domain.hostname;
  const staging = env.ACME_DIRECTORY !== "production";

  // Ordering here is a rate-limit safeguard, not just tidiness: submitting an
  // order for a domain that does not resolve to us burns a failed-validation
  // attempt against the CA's per-domain budget for no possible benefit.
  if (domain.status !== SiteDomainStatus.CONNECTED) {
    return { hostname, action: "skipped", reason: "DNS is not verified yet, so validation could not succeed.", notAfter: null, staging };
  }

  let redirectTo: string | null = null;
  if (domain.redirectToPrimary && !domain.isPrimary) {
    const primary = await siteDomainRepository.findPrimary(domain.siteId);
    // Only redirect to a primary that is actually connected; pointing at an
    // unverified hostname would hand visitors a dead end.
    if (primary && primary.status === SiteDomainStatus.CONNECTED) redirectTo = primary.hostname;
  }

  const result = await issueOrReuseCertificate(hostname, { redirectTo, force: options.force });

  if (result.action === "failed") {
    const existing = await readCertificateOnDisk(hostname);
    const remaining = existing ? daysUntil(existing.notAfter) : null;
    await siteDomainRepository.update(domain.id, {
      // An expiring-but-still-valid certificate keeps serving traffic, so a
      // failed renewal must not downgrade a live domain to FAILED.
      ...(remaining !== null && remaining > 0 ? {} : { sslStatus: SiteSslStatus.FAILED }),
      lastError: result.reason.slice(0, 500),
      lastCheckedAt: new Date(),
    });
  } else if (result.action !== "skipped") {
    await siteDomainRepository.update(domain.id, {
      sslStatus: SiteSslStatus.ACTIVE,
      ...(result.action === "issued" ? { sslIssuedAt: new Date() } : {}),
      sslExpiresAt: result.notAfter,
      lastCheckedAt: new Date(),
      // A staging certificate is real but untrusted by browsers, so it must not
      // read as a clean bill of health.
      lastError: result.staging
        ? "Issued against the Let's Encrypt staging directory — browsers will not trust it. Set ACME_DIRECTORY=production when ready."
        : null,
    });
  }

  return result;
}

/** Tear down nginx config for a tenant domain being removed. */
export async function deprovisionCertificate(hostname: string): Promise<void> {
  if (!provisioningEnabled()) return;
  // The certificate files are left in place on purpose: re-adding the same
  // domain then reuses them instead of spending another issuance against the
  // CA's weekly limit, and an unreferenced certificate is inert.
  await nginxManager.remove(hostname).catch((err) => {
    logger.warn("Failed to remove nginx vhost", { hostname, err: String(err) });
  });
}

// =====================================================================
// The platform's own hostname
// =====================================================================

/**
 * The platform's own hostnames: the primary (APP_URL), its www counterpart, and
 * any operator-configured extras.
 *
 * Derived from configuration rather than a `SiteDomain` row — the platform host
 * is not tenant data, and giving it one would let it collide with the very
 * reserved-hostname check that stops a tenant from claiming it.
 */
export function platformHostnames(): { primary: string; aliases: string[] } {
  const primary = (() => {
    try {
      return new URL(env.APP_URL).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const aliases = new Set<string>();
  if (primary && env.PLATFORM_INCLUDE_WWW && !primary.startsWith("www.")) {
    aliases.add(`www.${primary}`);
  }
  for (const extra of env.PLATFORM_ALT_HOSTNAMES) {
    if (extra && extra !== primary) aliases.add(extra);
  }

  return { primary, aliases: Array.from(aliases) };
}

/**
 * Confirm a hostname resolves to something before spending an ACME attempt on
 * it. Unlike a tenant domain there is no "PENDING, try later" state to fall back
 * to — a platform hostname that does not resolve is a deployment error, and this
 * turns it into a clear message instead of a wasted, failed order.
 */
async function resolvesAtAll(hostname: string): Promise<boolean> {
  const resolver = new Resolver({ timeout: 4000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  try {
    const addrs = await resolver.resolve4(hostname);
    return addrs.length > 0;
  } catch {
    return false;
  }
}

/**
 * Issue/renew the certificate and nginx vhost for one platform hostname.
 *
 * `role: "primary"` proxies to the app; `role: "alias"` (the www counterpart or
 * an extra hostname) redirects to the primary at the edge, exactly like a
 * tenant's www alias — same generator, same guarantees.
 */
export async function provisionPlatformHostname(
  hostname: string,
  role: "primary" | "alias",
  primaryHostname: string,
  options: { force?: boolean } = {},
): Promise<ProvisionResult> {
  const staging = env.ACME_DIRECTORY !== "production";

  if (!(await resolvesAtAll(hostname))) {
    return {
      hostname,
      action: "skipped",
      reason: `${hostname} does not resolve to anything yet. Point its DNS at this server before provisioning.`,
      notAfter: null,
      staging,
    };
  }

  return issueOrReuseCertificate(hostname, {
    redirectTo: role === "alias" ? primaryHostname : null,
    force: options.force,
  });
}

/**
 * Provision the platform's primary hostname and every alias.
 *
 * Called on boot-adjacent operations (the CLI) and by the hourly monitor, so the
 * platform's own certificate renews with the same reliability tenant
 * certificates get — nobody should have to remember to run this by hand.
 */
export async function provisionPlatformCertificates(
  options: { force?: boolean } = {},
): Promise<ProvisionResult[]> {
  const { primary, aliases } = platformHostnames();
  if (!primary) {
    return [
      {
        hostname: "(unresolvable)",
        action: "skipped",
        reason: "APP_URL is not a valid URL — cannot determine the platform hostname.",
        notAfter: null,
        staging: env.ACME_DIRECTORY !== "production",
      },
    ];
  }

  const results: ProvisionResult[] = [];
  results.push(await provisionPlatformHostname(primary, "primary", primary, options));
  for (const alias of aliases) {
    results.push(await provisionPlatformHostname(alias, "alias", primary, options));
  }
  return results;
}

/** Shared by the monitor to decide whether a renewal attempt is due. */
export function renewalDue(notAfter: Date | null): boolean {
  if (!notAfter) return true;
  return daysUntil(notAfter) <= RENEW_WITHIN_DAYS;
}

export { RENEW_WITHIN_DAYS, RENEWAL_WARNING_DAYS };
