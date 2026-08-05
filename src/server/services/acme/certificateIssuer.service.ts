/**
 * ACME certificate issuance for custom domains.
 *
 * Obtains a Let's Encrypt certificate over HTTP-01, with the challenge answered
 * by this app rather than from an nginx webroot. Written files are what nginx
 * then serves; see nginxManager.service.ts for the vhost side.
 *
 * Issuance is deliberately conservative. A certificate authority is a shared,
 * rate-limited resource: Let's Encrypt allows a handful of certificates per
 * domain per week, and burning that budget locks a tenant out of HTTPS for days
 * with no way to appeal. So every failure path here avoids retrying blindly, the
 * default directory is staging, and a domain whose DNS or CAA records are not
 * ready is never submitted at all.
 */

import acme from "acme-client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { acmeChallengeStore } from "./challengeStore";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

export interface IssuedCertificate {
  hostname: string;
  /** Absolute path to the full chain PEM, for nginx `ssl_certificate`. */
  certPath: string;
  /** Absolute path to the private key, for nginx `ssl_certificate_key`. */
  keyPath: string;
  issuer: string | null;
  notBefore: Date;
  notAfter: Date;
  /** True when issued against the staging directory, so it is not trusted. */
  staging: boolean;
}

export class CertificateIssuanceError extends Error {
  constructor(
    message: string,
    /** True when retrying later could plausibly succeed. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CertificateIssuanceError";
  }
}

function directoryUrl(): string {
  return env.ACME_DIRECTORY === "production"
    ? acme.directory.letsencrypt.production
    : acme.directory.letsencrypt.staging;
}

/**
 * Load the ACME account key, creating it on first use.
 *
 * Persisted because each new key means a new registration with the CA, and
 * accounts are themselves rate-limited — a deploy that regenerated the key every
 * boot would eventually stop being able to register at all.
 */
async function loadAccountKey(): Promise<Buffer> {
  const keyPath = env.ACME_ACCOUNT_KEY_PATH;

  try {
    return await fs.readFile(keyPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  logger.info("Creating ACME account key", { keyPath });
  const key = await acme.crypto.createPrivateKey();
  await fs.mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  // 0600: the account key can revoke every certificate we have issued.
  await fs.writeFile(keyPath, key, { mode: 0o600 });
  return key;
}

/**
 * Per-hostname directory holding the certificate and its key.
 *
 * Built with `path.posix` rather than `path.join`. These paths are consumed by
 * nginx, which runs on Linux and treats a backslash as an escape character, so a
 * Windows-style separator would produce a config that is silently wrong — and
 * `path.join` emits backslashes when the tooling runs on a Windows dev machine.
 * On Linux the two are identical, and Node's fs accepts forward slashes on every
 * platform, so posix is correct everywhere here.
 */
export function certificateDir(hostname: string): string {
  // Hostnames are validated on the way in, but this path is built from tenant
  // input and used for filesystem writes, so traversal is rejected outright
  // rather than sanitised — a "cleaned" hostname would silently write the wrong
  // certificate somewhere unexpected.
  if (!/^[a-z0-9.-]+$/i.test(hostname) || hostname.includes("..")) {
    throw new CertificateIssuanceError(`Refusing unsafe hostname: ${hostname}`, false);
  }
  return path.posix.join(env.SSL_CERT_PATH, hostname.toLowerCase());
}

export function certificatePaths(hostname: string): { certPath: string; keyPath: string } {
  const dir = certificateDir(hostname);
  return {
    certPath: path.posix.join(dir, "fullchain.pem"),
    keyPath: path.posix.join(dir, "privkey.pem"),
  };
}

/** True when both files for a hostname already exist on disk. */
export async function hasCertificateFiles(hostname: string): Promise<boolean> {
  const { certPath, keyPath } = certificatePaths(hostname);
  const [cert, key] = await Promise.all([
    fs.access(certPath).then(() => true).catch(() => false),
    fs.access(keyPath).then(() => true).catch(() => false),
  ]);
  return cert && key;
}

/**
 * Read the certificate currently on disk.
 *
 * Used to decide whether a renewal is actually needed, without depending on a
 * database field that could have drifted from the filesystem.
 */
export async function readCertificateOnDisk(
  hostname: string,
): Promise<{ notAfter: Date; notBefore: Date; issuer: string | null } | null> {
  try {
    const { certPath } = certificatePaths(hostname);
    const pem = await fs.readFile(certPath, "utf8");
    const info = acme.crypto.readCertificateInfo(pem);
    return {
      notAfter: info.notAfter,
      notBefore: info.notBefore,
      issuer: info.issuer?.commonName ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Obtain a certificate for `hostname` and write it to disk.
 *
 * Covers the bare hostname only. Apex domains do not automatically get `www`:
 * that is a separate hostname a tenant may not have pointed at us, and
 * including an unresolvable name in the order would fail the whole request.
 */
export async function issueCertificate(hostname: string): Promise<IssuedCertificate> {
  if (env.SSL_PROVISIONING !== "nginx") {
    throw new CertificateIssuanceError(
      "Certificate provisioning is disabled. Set SSL_PROVISIONING=nginx to enable it.",
      false,
    );
  }

  const staging = env.ACME_DIRECTORY !== "production";
  const dir = certificateDir(hostname);

  logger.info("Requesting certificate", { hostname, staging });

  const client = new acme.Client({
    directoryUrl: directoryUrl(),
    accountKey: await loadAccountKey(),
  });

  const [key, csr] = await acme.crypto.createCsr({ commonName: hostname });

  let chain: string;
  try {
    chain = await client.auto({
      csr,
      ...(env.ACME_CONTACT_EMAIL ? { email: env.ACME_CONTACT_EMAIL } : {}),
      termsOfServiceAgreed: true,
      // HTTP-01 only. DNS-01 would need write access to the tenant's zone,
      // which we do not have, and TLS-ALPN-01 needs to own the TLS listener.
      challengePriority: ["http-01"],
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        if (challenge.type !== "http-01") {
          throw new Error(`Unexpected challenge type ${challenge.type}`);
        }
        await acmeChallengeStore.put(challenge.token, keyAuthorization, hostname);
      },
      challengeRemoveFn: async (_authz, challenge) => {
        await acmeChallengeStore.remove(challenge.token);
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Rate limits and "too many certificates" must not be retried — that is how
    // a domain ends up locked out for a week.
    const retryable =
      !/rate ?limit|too many|urn:ietf:params:acme:error:rateLimited/i.test(message);
    logger.error("Certificate issuance failed", { hostname, retryable, message });
    throw new CertificateIssuanceError(
      `Certificate issuance failed for ${hostname}: ${message}`,
      retryable,
    );
  }

  const info = acme.crypto.readCertificateInfo(chain);

  await fs.mkdir(dir, { recursive: true, mode: 0o750 });
  const { certPath, keyPath } = certificatePaths(hostname);

  // Write to a temporary name and rename into place. nginx may be reading these
  // during a reload, and a half-written certificate would take the site down.
  await fs.writeFile(`${certPath}.tmp`, chain, { mode: 0o644 });
  await fs.writeFile(`${keyPath}.tmp`, key, { mode: 0o600 });
  await fs.rename(`${certPath}.tmp`, certPath);
  await fs.rename(`${keyPath}.tmp`, keyPath);

  logger.info("Certificate issued", {
    hostname,
    staging,
    issuer: info.issuer?.commonName,
    notAfter: info.notAfter.toISOString(),
  });

  return {
    hostname,
    certPath,
    keyPath,
    issuer: info.issuer?.commonName ?? null,
    notBefore: info.notBefore,
    notAfter: info.notAfter,
    staging,
  };
}
