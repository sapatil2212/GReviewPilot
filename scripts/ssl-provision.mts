/**
 * Certificate provisioning CLI.
 *
 * Exists because the first run on a new box is the one most likely to fail, and
 * doing it through the dashboard gives you a toast instead of an error. Run this
 * on the VPS to see exactly which step broke.
 *
 * Usage:
 *   npm run ssl:provision -- --check                  show configuration and exit
 *   npm run ssl:provision -- --preview clinic.com     print the nginx vhost
 *   npm run ssl:provision -- --host clinic.com        provision one domain
 *   npm run ssl:provision -- --all                    provision every connected domain
 *   npm run ssl:provision -- --host clinic.com --force  reissue even if valid
 *   npm run ssl:provision -- --platform                provision the app's own hostname(s)
 *
 * Start with --check, then --preview, then a single --host against
 * ACME_DIRECTORY=staging. Only switch to production once a staging certificate
 * has been issued end to end: production rate limits are per-domain and a
 * mistake there locks that domain out of HTTPS for a week.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // Already-populated environments are fine.
}

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const { env } = await import("../src/server/utils/env");
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

function heading(text: string) {
  console.log(`\n${text}`);
  console.log("-".repeat(text.length));
}

async function main() {
  heading("Configuration");
  console.log(`  SSL_PROVISIONING      ${env.SSL_PROVISIONING}`);
  console.log(`  ACME_DIRECTORY        ${env.ACME_DIRECTORY}${env.ACME_DIRECTORY === "staging" ? "  (certificates will NOT be browser-trusted)" : ""}`);
  console.log(`  ACME_CONTACT_EMAIL    ${env.ACME_CONTACT_EMAIL || "(unset)"}`);
  console.log(`  ACME_ACCOUNT_KEY_PATH ${env.ACME_ACCOUNT_KEY_PATH}`);
  console.log(`  SSL_CERT_PATH         ${env.SSL_CERT_PATH}`);
  console.log(`  NGINX_VHOST_PATH      ${env.NGINX_VHOST_PATH}`);
  console.log(`  NGINX_RELOAD_COMMAND  ${env.NGINX_RELOAD_COMMAND}`);
  console.log(`  SITE_APEX_IP          ${env.SITE_APEX_IP}   <- tenants point A records here`);
  console.log(`  APP_URL               ${env.APP_URL}`);

  if (env.SSL_PROVISIONING !== "nginx") {
    console.log(
      "\n  Provisioning is OFF. The app will observe certificates but never issue them.\n" +
        "  Set SSL_PROVISIONING=nginx to enable it.",
    );
  }
  if (!env.ACME_CONTACT_EMAIL) {
    console.log(
      "\n  ACME_CONTACT_EMAIL is unset. Set it so the CA can send expiry warnings if\n" +
        "  our own renewals ever stop running.",
    );
  }

  if (flag("check")) return;

  // ---- Preview a vhost without touching anything ----
  const previewHost = value("preview");
  if (previewHost) {
    const { nginxManager } = await import("../src/server/services/nginx/nginxManager.service");
    const { certificatePaths } = await import(
      "../src/server/services/acme/certificateIssuer.service"
    );
    const paths = certificatePaths(previewHost);
    heading(`nginx vhost for ${previewHost}`);
    console.log(`  would be written to: ${nginxManager.vhostPath(previewHost)}\n`);
    console.log(nginxManager.preview({ hostname: previewHost, ...paths }));
    return;
  }

  const {
    provisionCertificate,
    provisionPlatformCertificates,
    platformHostnames,
  } = await import("../src/server/services/sslProvisioning.service");
  const force = flag("force");

  // ---- The platform's own hostname(s) ----
  if (flag("platform")) {
    const { primary, aliases } = platformHostnames();
    heading("Platform hostnames");
    console.log(`  primary: ${primary || "(APP_URL is not a valid URL)"}`);
    console.log(`  aliases: ${aliases.length ? aliases.join(", ") : "(none)"}`);

    if (!primary) {
      console.error("\n  Cannot provision: APP_URL is not a valid URL.");
      process.exitCode = 1;
      return;
    }

    const results = await provisionPlatformCertificates({ force });
    console.log("");
    let failed = 0;
    for (const result of results) {
      if (result.action === "failed") failed += 1;
      console.log(
        `  ${result.action === "failed" ? "x" : "+"} ${result.hostname.padEnd(28)} ${result.action}  ${result.reason}`,
      );
    }
    if (results.some((r) => r.staging)) {
      console.log(
        "\n  Staging certificate(s) — browsers will show a warning. This proves the\n" +
          "  pipeline works. Set ACME_DIRECTORY=production and re-run with --force.",
      );
    }
    console.log(failed === 0 ? "\nDone." : `\n${failed} hostname(s) failed.`);
    process.exitCode = failed === 0 ? 0 : 1;
    return;
  }

  // ---- One domain ----
  const host = value("host");
  if (host) {
    const domain = await prisma.siteDomain.findUnique({ where: { hostname: host } });
    if (!domain) {
      console.error(`\n  No domain row for ${host}. Add it in the dashboard first.`);
      process.exitCode = 1;
      return;
    }

    heading(`Provisioning ${host}`);
    console.log(`  DNS status: ${domain.status}   SSL status: ${domain.sslStatus}`);
    if (domain.status !== "CONNECTED") {
      console.log(
        "\n  This domain is not CONNECTED, so issuance would fail validation and\n" +
          "  waste an attempt against the CA's rate limit. Verify DNS first.",
      );
    }

    const result = await provisionCertificate(domain, { force });
    console.log(`\n  action: ${result.action}`);
    console.log(`  reason: ${result.reason}`);
    if (result.notAfter) console.log(`  expires: ${result.notAfter.toISOString()}`);
    if (result.staging) {
      console.log(
        "\n  Staging certificate — browsers will show a warning. This proves the\n" +
          "  pipeline works. Set ACME_DIRECTORY=production and re-run with --force.",
      );
    }
    process.exitCode = result.action === "failed" ? 1 : 0;
    return;
  }

  // ---- Every connected domain ----
  if (flag("all")) {
    const domains = await prisma.siteDomain.findMany({
      where: { status: "CONNECTED" },
      orderBy: { createdAt: "asc" },
    });
    heading(`Provisioning ${domains.length} connected domain(s)`);

    let failed = 0;
    for (const domain of domains) {
      const result = await provisionCertificate(domain, { force });
      if (result.action === "failed") failed += 1;
      console.log(`  ${result.action === "failed" ? "x" : "+"} ${domain.hostname.padEnd(32)} ${result.action}  ${result.reason}`);
    }
    console.log(failed === 0 ? "\nDone." : `\n${failed} domain(s) failed.`);
    process.exitCode = failed === 0 ? 1 : 0;
    return;
  }

  console.log(
    "\nNothing to do. Pass --check, --preview <host>, --host <host>, or --all.\n" +
      "See the header of this file for the recommended order.",
  );
}

main()
  .catch((err) => {
    console.error("\nProvisioning CLI failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
