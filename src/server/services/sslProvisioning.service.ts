/**
 * End-to-end certificate provisioning for a custom domain.
 *
 * Sequences the three parts that have to happen in order: obtain a certificate
 * over ACME, write an nginx server block that uses it, then reload nginx. Split
 * out from siteDomain.service so that file, so the verification flow stays
 * readable and this can be driven independently by the scheduled job and by the
 * CLI used during deployment.
 *
 * A no-op unless SSL_PROVISIONING=nginx. On a managed host (Vercel, Cloudflare)
 * the platform issues certificates and this code must stay out of the way — the
 * monitor in sslMonitor.service.ts still reports on them either way.
 */

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
 * while the hourly sweep is running, or an impatient double-click. Without this,
 * both submit an ACME order and both count against Let's Encrypt's per-domain
 * weekly limit — five of which locks the domain out of HTTPS for a week. Callers
 * join the existing attempt instead of starting a second one.
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
 * Ensure `domain` has a working certificate and an nginx vhost.
 *
 * Idempotent: safe to call on every verification and on every scheduled run. A
 * certificate that is present and not near expiry is reused rather than
 * reissued, which is what keeps us inside the CA's rate limits.
 */
export async function provisionCertificate(
  domain: SiteDomain,
  options: { force?: boolean } = {},
): Promise<ProvisionResult> {
  const existingAttempt = inFlight.get(domain.hostname);
  if (existingAttempt) {
    logger.debug("Joining in-flight provisioning", { hostname: domain.hostname });
    return existingAttempt;
  }

  const attempt = provisionCertificateUncoordinated(domain, options).finally(() => {
    inFlight.delete(domain.hostname);
  });
  inFlight.set(domain.hostname, attempt);
  return attempt;
}

async function provisionCertificateUncoordinated(
  domain: SiteDomain,
  options: { force?: boolean } = {},
): Promise<ProvisionResult> {
  const hostname = domain.hostname;
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

  // Ordering here is a rate-limit safeguard, not just tidiness: submitting an
  // order for a domain that does not resolve to us burns a failed-validation
  // attempt against the CA's per-domain budget for no possible benefit.
  if (domain.status !== SiteDomainStatus.CONNECTED) {
    return skip("DNS is not verified yet, so validation could not succeed.");
  }

  const caa = await checkCaa(hostname).catch(() => null);
  if (caa && !caa.permitted) {
    await siteDomainRepository.update(domain.id, {
      sslStatus: SiteSslStatus.FAILED,
      lastError: (caa.message ?? "CAA records block issuance.").slice(0, 500),
      lastCheckedAt: new Date(),
    });
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
    await ensureVhost(domain);
    await siteDomainRepository.update(domain.id, {
      sslStatus: SiteSslStatus.ACTIVE,
      sslExpiresAt: existing.notAfter,
      lastCheckedAt: new Date(),
      lastError: null,
    });
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
    await ensureVhost(domain, issued.certPath, issued.keyPath);

    await siteDomainRepository.update(domain.id, {
      sslStatus: SiteSslStatus.ACTIVE,
      sslIssuedAt: issued.notBefore,
      sslExpiresAt: issued.notAfter,
      lastCheckedAt: new Date(),
      // A staging certificate is real but untrusted by browsers, so it must not
      // read as a clean bill of health.
      lastError: issued.staging
        ? "Issued against the Let's Encrypt staging directory — browsers will not trust it. Set ACME_DIRECTORY=production when ready."
        : null,
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

    await siteDomainRepository.update(domain.id, {
      // An expiring-but-still-valid certificate keeps serving traffic, so a
      // failed renewal must not downgrade a live domain to FAILED.
      ...(existing && remaining !== null && remaining > 0
        ? {}
        : { sslStatus: SiteSslStatus.FAILED }),
      lastError: message.slice(0, 500),
      lastCheckedAt: new Date(),
    });

    logger.error("Provisioning failed", { hostname, retryable, message });
    return { hostname, action: "failed", reason: message, notAfter: existing?.notAfter ?? null, staging };
  }
}

/**
 * Write the nginx server block for a domain.
 *
 * Alias domains configured to redirect are rendered as an edge redirect rather
 * than a proxy, so the canonical hostname is reached without the request
 * touching the app.
 */
async function ensureVhost(
  domain: SiteDomain,
  certPath?: string,
  keyPath?: string,
): Promise<void> {
  const paths = certPath && keyPath ? { certPath, keyPath } : certificatePaths(domain.hostname);

  let redirectTo: string | null = null;
  if (domain.redirectToPrimary && !domain.isPrimary) {
    const primary = await siteDomainRepository.findPrimary(domain.siteId);
    // Only redirect to a primary that is actually connected; pointing at an
    // unverified hostname would hand visitors a dead end.
    if (primary && primary.status === SiteDomainStatus.CONNECTED) {
      redirectTo = primary.hostname;
    }
  }

  await nginxManager.install({
    hostname: domain.hostname,
    certPath: paths.certPath,
    keyPath: paths.keyPath,
    redirectTo,
  });
}

/** Tear down nginx config for a domain being removed. */
export async function deprovisionCertificate(hostname: string): Promise<void> {
  if (!provisioningEnabled()) return;
  // The certificate files are left in place on purpose: re-adding the same
  // domain then reuses them instead of spending another issuance against the
  // CA's weekly limit, and an unreferenced certificate is inert.
  await nginxManager.remove(hostname).catch((err) => {
    logger.warn("Failed to remove nginx vhost", { hostname, err: String(err) });
  });
}

/** Shared by the monitor to decide whether a renewal attempt is due. */
export function renewalDue(notAfter: Date | null): boolean {
  if (!notAfter) return true;
  return daysUntil(notAfter) <= RENEW_WITHIN_DAYS;
}

export { RENEW_WITHIN_DAYS, RENEWAL_WARNING_DAYS };
