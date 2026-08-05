/**
 * Scheduled certificate reconciliation.
 *
 * Custom domains needed this to work at all. `sslStatus` only ever moved on a
 * user-initiated verify, so nothing observed a certificate after the moment it
 * was connected: issuance completing minutes later was never noticed, and a
 * renewal that quietly stopped working produced no signal until visitors hit a
 * browser warning. Certificates are time-bound state owned by an external
 * system, which makes periodic reconciliation the only way to track them
 * honestly.
 *
 * Designed to be safe to run often and never to be the reason a run fails:
 * every domain is isolated, and one unreachable host cannot abort the batch.
 */

import { SiteDomainStatus, SiteSslStatus, AuditAction } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { auditRepository } from "@/server/repositories/audit.repository";
import { reconcileCertificate } from "@/server/services/siteDomain.service";
import { RENEWAL_WARNING_DAYS } from "@/server/services/tlsCertificate.service";
import {
  provisionCertificate,
  provisioningEnabled,
} from "@/server/services/sslProvisioning.service";
import { acmeChallengeStore } from "@/server/services/acme/challengeStore";
import { logger } from "@/server/utils/logger";

export interface SslMonitorReport {
  checked: number;
  active: number;
  /** Valid certificates inside the renewal window. */
  renewalDue: number;
  /** Certificates actually issued or replaced during this run. */
  renewed: number;
  expired: number;
  failed: number;
  pending: number;
  errors: number;
  /** Domains needing attention, for the operator reading the cron output. */
  attention: Array<{
    hostname: string;
    sslStatus: SiteSslStatus;
    daysUntilExpiry: number | null;
    problem: string;
  }>;
  ranInMs: number;
}

/**
 * Concurrency cap.
 *
 * Each check is a TLS handshake with an up-to-8s timeout, so unbounded
 * parallelism across a large tenant base would open hundreds of sockets at once
 * and risk exhausting file descriptors. Six keeps a few thousand domains inside
 * a normal cron window without that risk.
 */
const CONCURRENCY = 6;

export async function runSslMonitor(
  options: { siteId?: string; hostname?: string } = {},
): Promise<SslMonitorReport> {
  const startedAt = Date.now();

  const domains = await prisma.siteDomain.findMany({
    where: {
      // REMOVED domains keep their row for audit history but must not be probed.
      status: { in: [SiteDomainStatus.CONNECTED, SiteDomainStatus.VERIFYING] },
      ...(options.siteId ? { siteId: options.siteId } : {}),
      ...(options.hostname ? { hostname: options.hostname } : {}),
    },
    orderBy: { lastCheckedAt: "asc" },
  });

  const report: SslMonitorReport = {
    checked: 0,
    active: 0,
    renewalDue: 0,
    renewed: 0,
    expired: 0,
    failed: 0,
    pending: 0,
    errors: 0,
    attention: [],
    ranInMs: 0,
  };

  // Expired challenge rows accumulate from abandoned orders; swept here so no
  // separate job is needed for them.
  await acmeChallengeStore.sweep().catch(() => 0);

  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (domain) => {
        try {
          // Self-hosted: attempt renewal before inspecting, so the report
          // reflects the certificate that will actually be serving traffic.
          // provisionCertificate is idempotent and reuses anything with more
          // than 30 days left, so this is cheap on most runs.
          if (provisioningEnabled() && domain.status === SiteDomainStatus.CONNECTED) {
            const result = await provisionCertificate(domain).catch((err) => {
              logger.error("Renewal attempt failed", {
                hostname: domain.hostname,
                err: err instanceof Error ? err.message : String(err),
              });
              return null;
            });
            if (result && (result.action === "issued" || result.action === "renewed")) {
              report.renewed += 1;
              logger.info("Certificate renewed by monitor", {
                hostname: domain.hostname,
                notAfter: result.notAfter?.toISOString() ?? null,
              });
            }
          }

          const { summary, transitionedToActive } = await reconcileCertificate(domain);
          report.checked += 1;

          switch (summary.sslStatus) {
            case SiteSslStatus.ACTIVE:
              report.active += 1;
              break;
            case SiteSslStatus.EXPIRED:
              report.expired += 1;
              break;
            case SiteSslStatus.FAILED:
              report.failed += 1;
              break;
            default:
              report.pending += 1;
          }

          if (summary.renewalDue) report.renewalDue += 1;

          // Audit only on transitions, not on every run: a job that writes an
          // audit row per domain per hour buries the events that matter.
          if (transitionedToActive) {
            await auditRepository.record({
              action: AuditAction.SITE_SSL_ISSUED,
              tenantId: domain.tenantId,
              metadata: {
                hostname: domain.hostname,
                issuer: summary.issuer,
                expiresAt: summary.expiresAt,
                source: "ssl-monitor",
              },
            });
          } else if (
            summary.renewalDue &&
            domain.sslStatus === SiteSslStatus.ACTIVE
          ) {
            await auditRepository.record({
              action: AuditAction.SITE_SSL_RENEWAL_DUE,
              tenantId: domain.tenantId,
              metadata: {
                hostname: domain.hostname,
                daysUntilExpiry: summary.daysUntilExpiry,
                expiresAt: summary.expiresAt,
              },
            });
          } else if (
            (summary.sslStatus === SiteSslStatus.FAILED ||
              summary.sslStatus === SiteSslStatus.EXPIRED) &&
            domain.sslStatus !== summary.sslStatus
          ) {
            await auditRepository.record({
              action: AuditAction.SITE_SSL_FAILED,
              tenantId: domain.tenantId,
              metadata: {
                hostname: domain.hostname,
                problems: summary.problems,
                detail: summary.summary,
              },
            });
          }

          const needsAttention =
            summary.sslStatus === SiteSslStatus.EXPIRED ||
            summary.sslStatus === SiteSslStatus.FAILED ||
            summary.renewalDue;
          if (needsAttention) {
            report.attention.push({
              hostname: domain.hostname,
              sslStatus: summary.sslStatus,
              daysUntilExpiry: summary.daysUntilExpiry,
              problem: summary.summary,
            });
          }
        } catch (err) {
          // One bad domain must not take the batch down with it.
          report.errors += 1;
          logger.error("SSL monitor failed for a domain", {
            hostname: domain.hostname,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  report.ranInMs = Date.now() - startedAt;

  logger.info("SSL monitor finished", {
    checked: report.checked,
    active: report.active,
    renewalDue: report.renewalDue,
    renewed: report.renewed,
    expired: report.expired,
    failed: report.failed,
    errors: report.errors,
    provisioning: provisioningEnabled() ? "nginx" : "off",
    warningWindowDays: RENEWAL_WARNING_DAYS,
    ranInMs: report.ranInMs,
  });

  return report;
}
