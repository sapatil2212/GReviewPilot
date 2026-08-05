/**
 * Custom domain management: DNS wizard, verification, and SSL status.
 *
 * Verification uses real DNS lookups via Node's resolver rather than trusting
 * the client, because domain ownership is a security boundary — without a
 * proof-of-control step, any tenant could claim any hostname and receive
 * traffic intended for it.
 *
 * SSL is reported, not issued, here. Certificate provisioning belongs to the
 * hosting platform (Vercel, Cloudflare, a reverse proxy), and this service
 * models the status so the UI can show progress honestly instead of implying
 * something happened that did not.
 */

import { Resolver } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { AuditAction, SiteDomainStatus, SiteSslStatus, type SiteDomain } from "@prisma/client";
import type { AuthContext } from "@/server/auth/requireSession";
import { auditRepository } from "@/server/repositories/audit.repository";
import { siteDomainRepository } from "@/server/repositories/siteDomain.repository";
import { siteRepository } from "@/server/repositories/site.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { ConflictError, NotFoundError, ValidationError } from "@/server/utils/errors";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import {
  inspectCertificate,
  type CertificateReport,
} from "@/server/services/tlsCertificate.service";
import type { AddDomainInput } from "@/server/validators/site.schema";

/**
 * Provisioning is imported lazily inside the functions that use it.
 *
 * sslProvisioning.service imports `checkCaa` from this module, so a top-level
 * import here would be a cycle. Deferring it to call time keeps both modules
 * loadable in any order.
 */
async function provisioning() {
  return import("@/server/services/sslProvisioning.service");
}

// =====================================================================
// Platform DNS targets
// =====================================================================

/**
 * Where tenants point their DNS.
 *
 * Derived from APP_URL so a self-hosted deployment gets correct instructions
 * without extra configuration, and overridable for platforms that require a
 * specific apex IP or CNAME target.
 */
function platformHost(): string {
  try {
    return new URL(env.APP_URL).host;
  } catch {
    return "app.example.com";
  }
}

/** A-record IP for apex domains. Configurable via SITE_APEX_IP. */
const APEX_IP = env.SITE_APEX_IP;

export interface DnsRecord {
  type: "A" | "CNAME" | "TXT";
  name: string;
  value: string;
  ttl: number;
  purpose: "routing" | "verification";
  note?: string;
}

/** True for `clinic.com`, false for `www.clinic.com`. */
export function isApex(hostname: string): boolean {
  const parts = hostname.split(".");
  // Handles common two-part public suffixes (co.uk, com.au) so a domain like
  // clinic.co.uk is correctly treated as an apex, not a subdomain.
  const twoPartTlds = ["co", "com", "net", "org", "gov", "edu", "ac"];
  if (parts.length === 3 && twoPartTlds.includes(parts[1])) return true;
  return parts.length === 2;
}

/**
 * The records the wizard tells the user to create.
 *
 * Apex domains get an A record because CNAME at the zone apex is invalid in
 * standard DNS; subdomains get a CNAME so the platform can change IPs without
 * every tenant re-editing DNS.
 */
export function buildDnsRecords(domain: SiteDomain): DnsRecord[] {
  const apex = isApex(domain.hostname);
  const records: DnsRecord[] = [];

  if (apex) {
    records.push({
      type: "A",
      name: "@",
      value: APEX_IP,
      ttl: 3600,
      purpose: "routing",
      note: "Some providers write @ as your domain name, or leave the host blank.",
    });
  } else {
    const sub = domain.hostname.split(".")[0];
    records.push({
      type: "CNAME",
      name: sub,
      value: platformHost(),
      ttl: 3600,
      purpose: "routing",
    });
  }

  records.push({
    type: "TXT",
    name: apex ? "_greviewpilot" : `_greviewpilot.${domain.hostname.split(".")[0]}`,
    value: domain.verificationToken,
    ttl: 3600,
    purpose: "verification",
    note: "This proves you own the domain. You can delete it once the domain is connected.",
  });

  return records;
}

// =====================================================================
// DNS lookups
// =====================================================================

/**
 * Public resolvers, not the system one.
 *
 * A server's local resolver may serve stale or split-horizon results, which
 * would make verification succeed or fail for reasons the tenant cannot see or
 * fix. Querying Cloudflare and Google directly means we observe what the rest
 * of the internet observes.
 */
function publicResolver(): Resolver {
  const resolver = new Resolver({ timeout: 4000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  return resolver;
}

export interface DnsCheck {
  record: DnsRecord;
  found: string[];
  matched: boolean;
}

// =====================================================================
// CAA preflight
// =====================================================================

export interface CaaCheck {
  /** True when any CAA record exists on the domain or a parent. */
  present: boolean;
  /** False only when CAA exists and does not authorise our issuing CA. */
  permitted: boolean;
  /** The zone the governing records were found at, e.g. "clinic.com". */
  foundAt: string | null;
  /** CA domains the zone authorises, e.g. ["letsencrypt.org"]. */
  authorised: string[];
  message: string | null;
}

/**
 * Check whether DNS permits our CA to issue for this hostname.
 *
 * A CAA record that omits the issuing CA makes certificate issuance fail
 * silently — the CA simply refuses, and the tenant sees a domain that verifies
 * fine but never gets HTTPS, with nothing in the UI explaining why. It is one of
 * the most common real causes of "stuck on pending", so it is worth a lookup.
 *
 * CAA is inherited: resolution walks up from the hostname and the closest zone
 * with any CAA record governs, so `www.clinic.com` is bound by `clinic.com`'s
 * records when it has none of its own.
 */
export async function checkCaa(hostname: string): Promise<CaaCheck> {
  const resolver = publicResolver();
  const expected = env.SSL_CA_ISSUER_DOMAIN.toLowerCase();
  const labels = hostname.split(".");

  // Stop before the public suffix: querying "com" is pointless and slow.
  for (let i = 0; i < labels.length - 1; i += 1) {
    const zone = labels.slice(i).join(".");
    let records: Array<{ critical: number; issue?: string; issuewild?: string }> = [];
    try {
      records = await resolver.resolveCaa(zone);
    } catch {
      // No CAA at this level, or the zone does not exist — keep walking up.
      continue;
    }

    const issueRecords = records.filter((r) => r.issue !== undefined);
    if (issueRecords.length === 0) continue;

    const authorised = issueRecords
      .map((r) => (r.issue ?? "").split(";")[0].trim().toLowerCase())
      .filter(Boolean);

    // ";" alone is an explicit "no CA may issue".
    const forbidsAll = authorised.length === 0 || authorised.every((a) => a === "");
    const permitted =
      !forbidsAll && authorised.some((a) => a === expected || a.endsWith(`.${expected}`));

    return {
      present: true,
      permitted,
      foundAt: zone,
      authorised,
      message: permitted
        ? null
        : forbidsAll
          ? `A CAA record on ${zone} forbids all certificate authorities. Remove it or add one for ${expected}.`
          : `A CAA record on ${zone} only allows ${authorised.join(", ")}. Add one for ${expected} or HTTPS cannot be issued.`,
    };
  }

  // No CAA anywhere means any CA may issue, which is the common case.
  return { present: false, permitted: true, foundAt: null, authorised: [], message: null };
}

async function lookup(record: DnsRecord, hostname: string): Promise<DnsCheck> {
  const resolver = publicResolver();
  const target =
    record.name === "@"
      ? hostname
      : record.name.includes(hostname)
        ? record.name
        : `${record.name}.${rootOf(hostname)}`;

  try {
    if (record.type === "A") {
      const found = await resolver.resolve4(hostname);
      return { record, found, matched: found.includes(record.value) };
    }
    if (record.type === "CNAME") {
      const found = await resolver.resolveCname(hostname);
      const normalized = found.map((f) => f.replace(/\.$/, "").toLowerCase());
      return {
        record,
        found: normalized,
        // Accept a suffix match: providers often append the zone, and some
        // proxies chain through an intermediate hostname.
        matched: normalized.some(
          (f) => f === record.value.toLowerCase() || f.endsWith(`.${record.value.toLowerCase()}`),
        ),
      };
    }
    const txt = await resolver.resolveTxt(target);
    const flat = txt.map((chunks) => chunks.join(""));
    return { record, found: flat, matched: flat.includes(record.value) };
  } catch (err) {
    // NXDOMAIN / ENODATA are the normal "not configured yet" case, not errors
    // worth surfacing as failures.
    const code = (err as { code?: string }).code;
    if (code && !["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes(code)) {
      logger.warn("DNS lookup failed", { hostname, type: record.type, code });
    }
    return { record, found: [], matched: false };
  }
}

function rootOf(hostname: string): string {
  return isApex(hostname) ? hostname : hostname.split(".").slice(1).join(".");
}

// =====================================================================
// Certificate reconciliation
// =====================================================================

export interface SslSummary {
  sslStatus: SiteSslStatus;
  valid: boolean;
  issuer: string | null;
  validFrom: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  /** True when a valid certificate is close enough to expiry to be a concern. */
  renewalDue: boolean;
  problems: string[];
  summary: string;
  caa: CaaCheck | null;
  checkedAt: string;
}

/**
 * Map an observed certificate onto a stored status.
 *
 * Kept as a pure function of the report so the transition rules are auditable in
 * one place rather than spread across the caller and the cron job.
 */
function statusFor(report: CertificateReport, routable: boolean): SiteSslStatus {
  if (report.valid) return SiteSslStatus.ACTIVE;
  if (report.problems.includes("expired")) return SiteSslStatus.EXPIRED;
  // "Nothing answering yet" on a domain that only just started resolving is the
  // normal waiting state, not a failure — issuance takes a few minutes and
  // flagging FAILED would send tenants chasing a problem that resolves itself.
  if (report.problems.includes("unreachable") || report.problems.includes("timeout")) {
    return routable ? SiteSslStatus.PENDING : SiteSslStatus.NONE;
  }
  return SiteSslStatus.FAILED;
}

/**
 * Inspect one domain's certificate and persist the outcome.
 *
 * Shared by the manual "Check SSL" action and the scheduled job so both apply
 * identical rules; two implementations would inevitably disagree about when a
 * certificate counts as active.
 */
export async function reconcileCertificate(domain: SiteDomain): Promise<{
  summary: SslSummary;
  report: CertificateReport;
  transitionedToActive: boolean;
}> {
  const routable = domain.status === SiteDomainStatus.CONNECTED;
  const report = await inspectCertificate(domain.hostname);

  // Only worth a CAA lookup when there is no working certificate — it explains
  // why issuance is blocked, and is noise once HTTPS is live.
  const caa = report.valid ? null : await checkCaa(domain.hostname).catch(() => null);

  const nextStatus = statusFor(report, routable);
  const transitionedToActive =
    nextStatus === SiteSslStatus.ACTIVE && domain.sslStatus !== SiteSslStatus.ACTIVE;

  // A CAA problem is the actionable cause, so it outranks the TLS symptom.
  const message = caa?.message ?? report.summary;

  await siteDomainRepository.update(domain.id, {
    sslStatus: nextStatus,
    sslExpiresAt: report.validTo,
    // Preserve the original issuance time across renewals of an already-active
    // certificate; only stamp it when HTTPS first starts working.
    ...(transitionedToActive ? { sslIssuedAt: report.validFrom ?? new Date() } : {}),
    lastCheckedAt: new Date(),
    ...(report.valid && !report.renewalDue ? {} : { lastError: message.slice(0, 500) }),
  });

  if (!report.valid && routable) {
    logger.warn("Custom domain has no usable certificate", {
      hostname: domain.hostname,
      problems: report.problems,
      caaBlocked: caa?.permitted === false,
    });
  }

  return {
    report,
    transitionedToActive,
    summary: {
      sslStatus: nextStatus,
      valid: report.valid,
      issuer: report.issuer,
      validFrom: report.validFrom?.toISOString() ?? null,
      expiresAt: report.validTo?.toISOString() ?? null,
      daysUntilExpiry: report.daysUntilExpiry,
      renewalDue: report.renewalDue,
      problems: report.problems,
      summary: message,
      caa,
      checkedAt: new Date().toISOString(),
    },
  };
}

// =====================================================================
// Service
// =====================================================================

export const siteDomainService = {
  async list(ctx: AuthContext, siteId: string) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const domains = await siteDomainRepository.listForSite(site.id);
    return domains.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      isPrimary: d.isPrimary,
      redirectToPrimary: d.redirectToPrimary,
      status: d.status,
      sslStatus: d.sslStatus,
      verifiedAt: d.verifiedAt,
      sslExpiresAt: d.sslExpiresAt,
      lastCheckedAt: d.lastCheckedAt,
      lastError: d.lastError,
      isApex: isApex(d.hostname),
      dnsRecords: buildDnsRecords(d),
      createdAt: d.createdAt,
    }));
  },

  async add(ctx: AuthContext, siteId: string, input: AddDomainInput, req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    // Reject the platform's own host and its subdomain-hosting root, either of
    // which would otherwise let a tenant capture dashboard traffic or another
    // tenant's subdomain through the custom-domain router.
    const reserved = platformHost().toLowerCase();
    const subdomainRoot = env.SITES_ROOT_DOMAIN.toLowerCase();
    const isReserved = (host: string, root: string) => root && (host === root || host.endsWith(`.${root}`));
    if (isReserved(input.hostname, reserved) || isReserved(input.hostname, subdomainRoot)) {
      throw new ValidationError("That domain is reserved by the platform");
    }

    const existing = await siteDomainRepository.findByHostname(input.hostname);
    if (existing) {
      // Deliberately vague when the domain belongs to someone else: confirming
      // which workspace owns a hostname would leak tenant information.
      throw new ConflictError(
        "CONFLICT",
        existing.siteId === site.id
          ? "That domain is already added to this website"
          : "That domain is already in use",
      );
    }

    const domain = await siteDomainRepository.create({
      siteId: site.id,
      tenantId: ctx.tenantId,
      hostname: input.hostname,
      isPrimary: input.isPrimary,
      redirectToPrimary: input.redirectToPrimary,
      // 32 hex chars: long enough that it cannot be guessed and published by
      // an attacker hoping to claim a domain they do not control.
      verificationToken: `greviewpilot-verify=${randomBytes(16).toString("hex")}`,
      status: SiteDomainStatus.PENDING,
    });

    const withRecords = await siteDomainRepository.update(domain.id, {
      dnsRecords: buildDnsRecords(domain) as unknown as object,
    });

    // First domain on a site becomes primary automatically.
    const all = await siteDomainRepository.listForSite(site.id);
    if (input.isPrimary || all.length === 1) {
      await siteDomainRepository.setPrimary(site.id, domain.id);
    }

    await auditRepository.record({
      action: AuditAction.SITE_DOMAIN_ADDED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, hostname: domain.hostname },
      ...(req ? extractRequestContext(req) : {}),
    });

    return {
      id: withRecords.id,
      hostname: withRecords.hostname,
      status: withRecords.status,
      isApex: isApex(withRecords.hostname),
      dnsRecords: buildDnsRecords(withRecords),
      verificationToken: withRecords.verificationToken,
    };
  },

  /**
   * Check DNS and advance the domain's status.
   *
   * Routing and verification are checked independently so the UI can tell the
   * user exactly which record is still missing, rather than a bare "not
   * verified" that gives them nothing to act on.
   */
  async verify(ctx: AuthContext, siteId: string, domainId: string, req?: Request) {
    const domain = await siteDomainRepository.findById(ctx.tenantId, domainId);
    if (!domain || domain.siteId !== siteId) throw new NotFoundError("Domain not found");

    const records = buildDnsRecords(domain);
    const checks = await Promise.all(records.map((r) => lookup(r, domain.hostname)));

    const routing = checks.find((c) => c.record.purpose === "routing");
    const verification = checks.find((c) => c.record.purpose === "verification");

    const routingOk = routing?.matched ?? false;
    const ownershipOk = verification?.matched ?? false;
    const connected = routingOk && ownershipOk;

    const status = connected
      ? SiteDomainStatus.CONNECTED
      : checks.some((c) => c.found.length > 0)
        ? // Records exist but do not match yet: almost always propagation, so
          // VERIFYING is more accurate (and less alarming) than FAILED.
          SiteDomainStatus.VERIFYING
        : SiteDomainStatus.PENDING;

    const lastError = connected
      ? null
      : !ownershipOk && !routingOk
        ? "Neither the routing record nor the TXT verification record was found yet."
        : !ownershipOk
          ? "The TXT verification record was not found. DNS changes can take up to 48 hours."
          : "The routing record does not point here yet.";

    const updated = await siteDomainRepository.update(domain.id, {
      status,
      lastCheckedAt: new Date(),
      lastError,
      ...(connected && !domain.verifiedAt ? { verifiedAt: new Date() } : {}),
      // SSL cannot be issued until DNS resolves to us, so it moves to PENDING
      // only once routing is confirmed.
      ...(connected && domain.sslStatus === SiteSslStatus.NONE
        ? { sslStatus: SiteSslStatus.PENDING }
        : {}),
      dnsRecords: records as unknown as object,
    });

    // Once routing resolves, report the real certificate state straight away.
    // Without this the tenant is left looking at "SSL pending" with no idea
    // whether anything is happening, which is precisely the state this flow
    // used to get permanently stuck in.
    let ssl: SslSummary | null = null;
    if (connected) {
      // Self-hosted deployments issue the certificate here, the moment DNS is
      // confirmed. Awaited rather than backgrounded so the tenant sees the
      // outcome on the click that caused it; a failure is recorded on the domain
      // and retried by the scheduled job, so it never blocks verification.
      const { provisioningEnabled, provisionCertificate } = await provisioning();
      if (provisioningEnabled()) {
        const provisioned = await provisionCertificate({ ...updated, status }).catch((err) => {
          logger.error("Provisioning during verify failed", {
            hostname: domain.hostname,
            err: String(err),
          });
          return null;
        });
        if (provisioned && provisioned.action !== "skipped") {
          logger.info("Provisioning result", {
            hostname: domain.hostname,
            action: provisioned.action,
          });
        }
      }

      ssl = await reconcileCertificate({ ...updated, status })
        .then((r) => r.summary)
        // Verification must still succeed if the TLS probe fails; the SSL panel
        // and the scheduled job will retry.
        .catch((err) => {
          logger.warn("SSL check during verify failed", {
            hostname: domain.hostname,
            err: String(err),
          });
          return null;
        });
    } else if (checks.some((c) => c.found.length > 0)) {
      // Records are appearing but routing is not confirmed. A CAA problem here
      // is worth surfacing early, while the tenant is still in their DNS panel.
      const caa = await checkCaa(domain.hostname).catch(() => null);
      if (caa && !caa.permitted) {
        ssl = {
          sslStatus: updated.sslStatus,
          valid: false,
          issuer: null,
          validFrom: null,
          expiresAt: null,
          daysUntilExpiry: null,
          renewalDue: false,
          problems: ["caa_blocked"],
          summary: caa.message ?? "CAA records block certificate issuance.",
          caa,
          checkedAt: new Date().toISOString(),
        };
      }
    }

    if (connected && !domain.verifiedAt) {
      await auditRepository.record({
        action: AuditAction.SITE_DOMAIN_VERIFIED,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        metadata: { siteId, hostname: domain.hostname },
        ...(req ? extractRequestContext(req) : {}),
      });
    } else if (!connected) {
      await auditRepository.record({
        action: AuditAction.SITE_DOMAIN_VERIFY_FAILED,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        metadata: { siteId, hostname: domain.hostname, routingOk, ownershipOk },
        ...(req ? extractRequestContext(req) : {}),
      });
    }

    return {
      status: updated.status,
      sslStatus: ssl?.sslStatus ?? updated.sslStatus,
      connected,
      routingOk,
      ownershipOk,
      verifiedAt: updated.verifiedAt,
      lastError,
      ssl,
      checks: checks.map((c) => ({
        type: c.record.type,
        name: c.record.name,
        expected: c.record.value,
        found: c.found,
        matched: c.matched,
        purpose: c.record.purpose,
      })),
    };
  },

  /**
   * Inspect the live certificate and record what was found.
   *
   * This is what makes `sslStatus` mean something. Previously it was set to
   * PENDING on verification and never advanced by any code path, so the wizard
   * promised automatic HTTPS that nothing delivered and `sslExpiresAt` stayed
   * null forever — no renewal monitoring was possible.
   */
  async checkSsl(ctx: AuthContext, siteId: string, domainId: string, req?: Request) {
    const domain = await siteDomainRepository.findById(ctx.tenantId, domainId);
    if (!domain || domain.siteId !== siteId) throw new NotFoundError("Domain not found");

    const result = await reconcileCertificate(domain);

    if (result.transitionedToActive) {
      await auditRepository.record({
        action: AuditAction.SITE_SSL_ISSUED,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        metadata: {
          siteId,
          hostname: domain.hostname,
          issuer: result.report.issuer,
          expiresAt: result.report.validTo?.toISOString() ?? null,
        },
        ...(req ? extractRequestContext(req) : {}),
      });
    }

    return result.summary;
  },

  async update(
    ctx: AuthContext,
    siteId: string,
    domainId: string,
    input: { isPrimary?: boolean; redirectToPrimary?: boolean },
    req?: Request,
  ) {
    const domain = await siteDomainRepository.findById(ctx.tenantId, domainId);
    if (!domain || domain.siteId !== siteId) throw new NotFoundError("Domain not found");

    if (input.isPrimary) {
      if (domain.status !== SiteDomainStatus.CONNECTED) {
        // Making an unverified domain primary would break every canonical URL,
        // sitemap entry, and OG tag on the site.
        throw new ValidationError("Connect and verify this domain before making it primary");
      }
      await siteDomainRepository.setPrimary(siteId, domain.id);
      await auditRepository.record({
        action: AuditAction.SITE_DOMAIN_PRIMARY_SET,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        metadata: { siteId, hostname: domain.hostname },
        ...(req ? extractRequestContext(req) : {}),
      });
    }

    if (input.redirectToPrimary !== undefined) {
      if (input.redirectToPrimary && domain.isPrimary) {
        throw new ValidationError("The primary domain cannot redirect to itself");
      }
      await siteDomainRepository.update(domain.id, {
        redirectToPrimary: input.redirectToPrimary,
      });
    }

    return siteDomainRepository.findById(ctx.tenantId, domain.id);
  },

  async remove(ctx: AuthContext, siteId: string, domainId: string, req?: Request) {
    const domain = await siteDomainRepository.findById(ctx.tenantId, domainId);
    if (!domain || domain.siteId !== siteId) throw new NotFoundError("Domain not found");

    const all = await siteDomainRepository.listForSite(siteId);
    if (domain.isPrimary && all.length > 1) {
      throw new ValidationError(
        "Make another domain primary before removing this one, so the site keeps a canonical address.",
      );
    }

    await siteDomainRepository.remove(domain.id);

    // Tear down the nginx server block, otherwise the box keeps serving a
    // hostname the tenant has just disconnected. Non-fatal: the domain row is
    // already gone, and a stale vhost is a cleanup problem rather than a reason
    // to fail the request the user is waiting on.
    const { deprovisionCertificate } = await provisioning();
    await deprovisionCertificate(domain.hostname).catch((err) => {
      logger.warn("Deprovisioning failed after domain removal", {
        hostname: domain.hostname,
        err: String(err),
      });
    });

    await auditRepository.record({
      action: AuditAction.SITE_DOMAIN_REMOVED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, hostname: domain.hostname },
      ...(req ? extractRequestContext(req) : {}),
    });
  },

  /** Wizard copy, so the UI and the API cannot describe different steps. */
  wizardSteps(): Array<{ step: number; title: string; detail: string }> {
    return [
      {
        step: 1,
        title: "Add your domain",
        detail: "Enter the domain you own, for example clinic.com or www.clinic.com.",
      },
      {
        step: 2,
        title: "Create the DNS records",
        detail:
          "Sign in to your domain registrar and add the records we show you. Copy the values exactly.",
      },
      {
        step: 3,
        title: "Verify",
        detail:
          "Press Verify. DNS changes usually apply within 30 minutes but can take up to 48 hours.",
      },
      {
        step: 4,
        title: "HTTPS certificate",
        detail:
          "Once DNS resolves to us, a certificate is issued for your domain, usually within 15 minutes. " +
          "We check it continuously and renew it before it expires — press Check SSL to see its current state.",
      },
      {
        step: 5,
        title: "Publish",
        detail: "Publish your site and it goes live on your own domain.",
      },
    ];
  },
};
