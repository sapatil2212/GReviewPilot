/**
 * Live TLS certificate inspection.
 *
 * The domain service previously modelled SSL as a status field that nothing
 * ever advanced: connecting a domain set `sslStatus` to PENDING and no code
 * path anywhere moved it to ACTIVE, so the wizard's promise that "a certificate
 * is issued automatically and renews itself" was never fulfilled and tenants
 * saw "SSL pending" forever. `sslIssuedAt` and `sslExpiresAt` were never
 * written either, so an expiring certificate produced no warning.
 *
 * This module makes the status observed rather than assumed. It opens a real
 * TLS connection to the tenant's hostname and reports what the internet
 * actually sees: who issued the certificate, what names it covers, when it
 * expires, and whether a normal client would trust it.
 *
 * Inspecting rather than issuing is deliberate. Certificates are issued by
 * whatever terminates TLS in front of this app (Vercel, Cloudflare, Caddy,
 * certbot + nginx), and each does it differently. Observation works with all of
 * them and cannot disagree with reality, which a mirrored copy of issuance
 * state inevitably would.
 */

import { connect as tlsConnect, type PeerCertificate } from "node:tls";
import { logger } from "@/server/utils/logger";

/** Days before expiry at which a certificate is considered at risk. */
export const RENEWAL_WARNING_DAYS = 21;

export type CertificateProblem =
  | "unreachable"
  | "timeout"
  | "handshake_failed"
  | "hostname_mismatch"
  | "expired"
  | "not_yet_valid"
  | "untrusted";

export interface CertificateReport {
  hostname: string;
  /** True only when a normal browser would accept this certificate. */
  valid: boolean;
  problems: CertificateProblem[];
  issuer: string | null;
  subject: string | null;
  /** Every name the certificate covers, from the SAN extension. */
  altNames: string[];
  validFrom: Date | null;
  validTo: Date | null;
  daysUntilExpiry: number | null;
  /** True when a valid certificate is inside the renewal warning window. */
  renewalDue: boolean;
  /** Node's trust-chain verdict, e.g. DEPTH_ZERO_SELF_SIGNED_CERT. */
  authorizationError: string | null;
  /** Human-readable summary suitable for showing a tenant. */
  summary: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Wildcard-aware hostname matching, per RFC 6125.
 *
 * A wildcard covers exactly one label, so `*.example.com` matches
 * `www.example.com` but not `a.b.example.com` and not the apex `example.com`.
 * Getting this wrong in either direction is bad: too strict and we report a
 * working certificate as broken, too loose and we tell a tenant their site is
 * secure when browsers will warn.
 */
export function certificateCoversHostname(hostname: string, altNames: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return altNames.some((raw) => {
    const name = raw.toLowerCase().replace(/\.$/, "");
    if (name === host) return true;
    if (!name.startsWith("*.")) return false;
    const suffix = name.slice(1); // ".example.com"
    if (!host.endsWith(suffix)) return false;
    // Only one label may replace the wildcard.
    return !host.slice(0, host.length - suffix.length).includes(".");
  });
}

/**
 * Read one distinguished-name attribute.
 *
 * X.509 permits an attribute to appear more than once, so Node types these as
 * `string | string[]`. The first value is the conventional one to display.
 */
function dnValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Parse the `subjectaltname` string Node exposes ("DNS:a.com, DNS:b.com"). */
function parseAltNames(cert: PeerCertificate): string[] {
  const raw = (cert as { subjectaltname?: string }).subjectaltname;
  if (!raw) {
    // Fall back to the legacy CN when a certificate has no SAN extension.
    const cn = dnValue(cert.subject?.CN);
    return cn ? [cn] : [];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.toLowerCase().startsWith("dns:"))
    .map((part) => part.slice(4).trim())
    .filter(Boolean);
}

function formatName(value: PeerCertificate["issuer"] | undefined): string | null {
  if (!value) return null;
  // Organisation is the useful identity ("Let's Encrypt"); CN is the chain
  // link ("R3"), which alone tells a tenant nothing.
  return dnValue(value.O) ?? dnValue(value.CN);
}

interface RawProbe {
  cert: PeerCertificate | null;
  authorized: boolean;
  authorizationError: string | null;
  problem: CertificateProblem | null;
}

/**
 * Open one TLS connection and capture the peer certificate.
 *
 * `rejectUnauthorized: false` is required, not a shortcut: aborting on an
 * untrusted certificate would leave us unable to explain *why* it is untrusted,
 * which is the single most useful thing to tell a tenant. Nothing is
 * transmitted over this socket and the trust verdict is preserved separately in
 * `authorized`/`authorizationError`, so lowering the flag does not lower the
 * standard we report against.
 */
function probe(hostname: string, port: number, timeoutMs: number): Promise<RawProbe> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: RawProbe) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = tlsConnect({
      host: hostname,
      port,
      servername: hostname, // SNI — shared hosts return the wrong cert without it.
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });

    socket.once("secureConnect", () => {
      finish({
        cert: socket.getPeerCertificate(true),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError
          ? String((socket.authorizationError as Error).message ?? socket.authorizationError)
          : null,
        problem: null,
      });
    });

    socket.once("timeout", () => {
      finish({ cert: null, authorized: false, authorizationError: null, problem: "timeout" });
    });

    socket.once("error", (err: NodeJS.ErrnoException) => {
      // A refused or unresolvable host is "not set up yet", which is different
      // from a host that answers with a bad certificate.
      const problem: CertificateProblem =
        err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH"
          ? "unreachable"
          : err.code === "ETIMEDOUT"
            ? "timeout"
            : "handshake_failed";
      finish({ cert: null, authorized: false, authorizationError: err.message, problem });
    });
  });
}

/**
 * Inspect the certificate served for `hostname`.
 *
 * Never throws: this runs inside verification requests and a scheduled job, and
 * a DNS hiccup must produce a reportable state rather than a failed request or
 * a dead cron run.
 */
export async function inspectCertificate(
  hostname: string,
  options: { port?: number; timeoutMs?: number } = {},
): Promise<CertificateReport> {
  const port = options.port ?? 443;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const base: CertificateReport = {
    hostname,
    valid: false,
    problems: [],
    issuer: null,
    subject: null,
    altNames: [],
    validFrom: null,
    validTo: null,
    daysUntilExpiry: null,
    renewalDue: false,
    authorizationError: null,
    summary: "",
  };

  let raw: RawProbe;
  try {
    raw = await probe(hostname, port, timeoutMs);
  } catch (err) {
    logger.warn("TLS probe threw", { hostname, err: String(err) });
    return { ...base, problems: ["handshake_failed"], summary: "Could not complete a TLS handshake." };
  }

  if (raw.problem || !raw.cert || Object.keys(raw.cert).length === 0) {
    const problem = raw.problem ?? "handshake_failed";
    return {
      ...base,
      problems: [problem],
      authorizationError: raw.authorizationError,
      summary:
        problem === "unreachable"
          ? "Nothing is answering HTTPS on this domain yet."
          : problem === "timeout"
            ? "The HTTPS connection timed out."
            : "Could not complete a TLS handshake.",
    };
  }

  const cert = raw.cert;
  const altNames = parseAltNames(cert);
  const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
  const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
  const now = Date.now();

  const problems: CertificateProblem[] = [];
  if (!certificateCoversHostname(hostname, altNames)) problems.push("hostname_mismatch");
  if (validTo && validTo.getTime() < now) problems.push("expired");
  if (validFrom && validFrom.getTime() > now) problems.push("not_yet_valid");
  // Only report untrusted on its own account when the cause is not already
  // explained by expiry or the wrong hostname, so the tenant gets one clear
  // reason instead of three symptoms of the same thing.
  if (!raw.authorized && problems.length === 0) problems.push("untrusted");

  const daysUntilExpiry = validTo
    ? Math.floor((validTo.getTime() - now) / (24 * 60 * 60 * 1000))
    : null;

  const valid = problems.length === 0 && raw.authorized;
  const renewalDue =
    valid && daysUntilExpiry !== null && daysUntilExpiry <= RENEWAL_WARNING_DAYS;

  return {
    hostname,
    valid,
    problems,
    issuer: formatName(cert.issuer),
    subject: formatName(cert.subject),
    altNames,
    validFrom,
    validTo,
    daysUntilExpiry,
    renewalDue,
    authorizationError: raw.authorizationError,
    summary: summarize({ valid, problems, issuer: formatName(cert.issuer), daysUntilExpiry, renewalDue }),
  };
}

function summarize(input: {
  valid: boolean;
  problems: CertificateProblem[];
  issuer: string | null;
  daysUntilExpiry: number | null;
  renewalDue: boolean;
}): string {
  if (input.valid) {
    const issuer = input.issuer ? ` by ${input.issuer}` : "";
    if (input.renewalDue) {
      return `Certificate issued${issuer} expires in ${input.daysUntilExpiry} days and has not renewed yet.`;
    }
    return input.daysUntilExpiry !== null
      ? `Valid certificate issued${issuer}, expires in ${input.daysUntilExpiry} days.`
      : `Valid certificate issued${issuer}.`;
  }

  const [first] = input.problems;
  switch (first) {
    case "hostname_mismatch":
      return "The certificate being served does not cover this domain.";
    case "expired":
      return "The certificate has expired.";
    case "not_yet_valid":
      return "The certificate is not valid yet.";
    case "untrusted":
      return "The certificate is not trusted by browsers (incomplete chain or self-signed).";
    default:
      return "No usable certificate was found.";
  }
}
