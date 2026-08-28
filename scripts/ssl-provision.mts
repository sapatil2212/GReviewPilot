/**
 * Certificate provisioning CLI.
 *
 * Exists because the first run on a new box is the one most likely to fail, and
 * doing it through the dashboard gives you a toast instead of an error. Run this
 * on the VPS to see exactly which step broke.
 *
 * Usage:
 *   npm run ssl:provision -- --check                  show configuration and exit
 *   npm run ssl:provision -- --diagnose clinic.com    explain why HTTPS is not working
 *   npm run ssl:provision -- --nginx clinic.com       which server block nginx uses
 *   npm run ssl:provision -- --preview clinic.com     print the nginx vhost
 *   npm run ssl:provision -- --host clinic.com        provision one domain
 *   npm run ssl:provision -- --all                    provision every connected domain
 *   npm run ssl:provision -- --host clinic.com --force  reissue even if valid
 *   npm run ssl:provision -- --platform                provision the app's own hostname(s)
 *
 * `--diagnose` contacts no certificate authority and changes nothing, so it is
 * always safe to run and is the right first step for a domain that is stuck.
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

  // ---- Inspect nginx's effective config for a hostname ----
  const nginxHost = value("nginx");
  if (nginxHost) {
    await inspectNginx(nginxHost);
    return;
  }

  // ---- Diagnose one hostname without contacting the CA ----
  const diagnoseHost = value("diagnose");
  if (diagnoseHost) {
    await diagnose(diagnoseHost);
    await inspectNginx(diagnoseHost);
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
    // Was inverted: a clean run exited 1 and a run with failures exited 0, so
    // this command reported the opposite of the truth to any shell or CI using it.
    process.exitCode = failed === 0 ? 0 : 1;
    return;
  }

  console.log(
    "\nNothing to do. Pass --check, --diagnose <host>, --preview <host>, --host <host>,\n" +
      "or --all. See the header of this file for the recommended order.",
  );
}

/**
 * Report which server block nginx will actually use for a hostname.
 *
 * Reads `nginx -T`, not the files on disk. A vhost can exist, pass `nginx -t`,
 * survive a reload and still never be consulted — because the directory holding
 * it is not in the effective config, because another site already claims the
 * hostname (nginx keeps the first and silently ignores the rest), or because the
 * ports are bound to specific addresses and a wildcard `listen 80` is in a
 * different socket group. All three look identical from the application side, and
 * none of them are visible to a grep over /etc/nginx.
 */
async function inspectNginx(hostname: string) {
  const { dumpEffectiveConfig, selectFor, includesVhostDirectory, NginxInspectionError } =
    await import("../src/server/services/nginx/nginxInspector.service");
  const { nginxManager } = await import("../src/server/services/nginx/nginxManager.service");

  heading(`nginx effective config for ${hostname}`);

  let config;
  try {
    config = await dumpEffectiveConfig();
  } catch (err) {
    if (err instanceof NginxInspectionError) {
      console.log(`  ! could not read the effective config — ${err.message}`);
      console.log("    Run this as root on the server: sudo nginx -T");
      return;
    }
    throw err;
  }

  // The single most important line. If this is false, every generated vhost is
  // inert no matter how correct its contents are.
  const loaded = includesVhostDirectory(config);
  console.log(
    `  ${loaded ? "+" : "x"} vhost directory is in the effective config — ${env.NGINX_VHOST_PATH}`,
  );
  if (!loaded) {
    console.log(
      "      nginx has NOT loaded any file from this directory. Files written there\n" +
        "      are ignored, which is why the hostname is served by another site.\n" +
        "      A grep of /etc/nginx can find the include line in a sites-available\n" +
        "      file that was never symlinked into sites-enabled — looking present and\n" +
        "      doing nothing. Fix, inside the http { } block of /etc/nginx/nginx.conf:\n" +
        `        include ${env.NGINX_VHOST_PATH}/*;\n` +
        "      then: sudo nginx -t && sudo systemctl reload nginx",
    );
  }

  const expectedFile = nginxManager.vhostPath(hostname);
  for (const port of ["80", "443"]) {
    const result = selectFor(config.blocks, hostname, port);
    console.log(`\n  port ${port}:`);

    if (result.exact.length === 0 && result.wildcard.length === 0) {
      const target = result.defaults[0];
      console.log(
        `    x no server block declares "${hostname}" — served by ` +
          (target ? `default_server in ${target.file}` : "nginx's built-in default"),
      );
      if (target) {
        console.log(
          `        that block answers for: ${target.serverNames.join(", ") || "(no server_name)"}`,
        );
        if (target.certificatePath) {
          console.log(`        and presents: ${target.certificatePath}`);
        }
      }
      if (port === "80") {
        console.log(`      expected a block from: ${expectedFile}`);
      }
    } else {
      for (const [index, block] of [...result.exact, ...result.wildcard].entries()) {
        const winner = index === 0;
        const ours = block.file === expectedFile;
        console.log(
          `    ${winner ? "+" : "x"} ${winner ? "SERVES" : "IGNORED"}  ${block.file}${ours ? "   <- ours" : ""}`,
        );
        console.log(
          `        listen ${block.listens.map((l) => l.raw).join(" | ")}` +
            `   server_name ${block.serverNames.join(" ")}`,
        );
        if (block.proxyPasses.length > 0) {
          console.log(`        proxy_pass ${Array.from(new Set(block.proxyPasses)).join(", ")}`);
        }
        if (port === "80") {
          console.log(
            `        forwards /.well-known/acme-challenge/: ${block.servesAcmeChallenge ? "yes" : "NO"}`,
          );
        }
      }
      if (result.conflicting) {
        console.log(
          "\n      x Two or more blocks claim this hostname. nginx keeps the FIRST it\n" +
            "        loads and ignores the rest, warning on reload rather than failing.\n" +
            "        Remove the hostname from the other block, or make our include come\n" +
            "        first in nginx.conf.",
        );
      }
      const servingOurs = (result.exact[0] ?? result.wildcard[0])?.file === expectedFile;
      if (!servingOurs && port === "80") {
        console.log(
          "\n      This is why validation 404s and visitors see the wrong site: the\n" +
            "      hostname is being served by a block that is not ours.",
        );
      }
    }

    if (result.explicitAddresses.length > 0) {
      console.log(
        `    ! port ${port} has explicit bind address(es): ${result.explicitAddresses.join(", ")}`,
      );
      console.log(
        "        nginx picks the listening socket BEFORE it looks at server_name, so a\n" +
          "        block that only says `listen " +
          port +
          "` is not in that socket's group and\n" +
          "        will never be consulted for requests arriving on that address.",
      );
    }
  }
}

/**
 * Explain why a hostname does or does not have working HTTPS, without spending an
 * ACME attempt.
 *
 * Written because the failure this feature actually hits in production is silent
 * from every angle: DNS looks right, the dashboard says CONNECTED, and the only
 * visible symptom is a bare nginx 404 with a certificate error that names the
 * wrong cause. Each line below is one link in the chain, printed in the order it
 * has to hold, so the first `x` is the thing to fix.
 */
async function diagnose(hostname: string) {
  const { nginxManager } = await import("../src/server/services/nginx/nginxManager.service");
  const { readCertificateOnDisk, hasCertificateFiles, certificatePaths } = await import(
    "../src/server/services/acme/certificateIssuer.service"
  );
  const { checkChallengeReachability } = await import(
    "../src/server/services/acme/challengeReachability"
  );
  const { checkCaa } = await import("../src/server/services/siteDomain.service");
  const { inspectCertificate } = await import(
    "../src/server/services/tlsCertificate.service"
  );

  heading(`Diagnosing ${hostname}`);

  // 1. Is it even known to the app?
  const domain = await prisma.siteDomain.findUnique({ where: { hostname } });
  if (domain) {
    console.log(`  + known domain     status=${domain.status} ssl=${domain.sslStatus}`);
    if (domain.lastError) console.log(`      last error: ${domain.lastError}`);
  } else {
    const { platformHostnames } = await import("../src/server/services/sslProvisioning.service");
    const { primary, aliases } = platformHostnames();
    if (hostname === primary || aliases.includes(hostname)) {
      console.log("  + platform hostname (from APP_URL) — not a tenant domain");
    } else {
      console.log(
        "  x unknown hostname — no SiteDomain row and not a platform hostname.\n" +
          "      Requests for it are routed as a tenant custom domain and will 404.",
      );
    }
  }

  // 2. DNS.
  const dns = await import("node:dns/promises");
  const resolver = new dns.Resolver({ timeout: 4000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  try {
    const addrs = await resolver.resolve4(hostname);
    const pointsHere = addrs.includes(env.SITE_APEX_IP);
    console.log(
      `  ${pointsHere ? "+" : "!"} DNS A record     ${addrs.join(", ")}` +
        (pointsHere ? "" : `   (SITE_APEX_IP is ${env.SITE_APEX_IP})`),
    );
    if (!pointsHere) {
      console.log(
        "      Not fatal on its own — a proxy or load balancer in front is normal —\n" +
          "      but validation and TLS both have to reach THIS server.",
      );
    }
  } catch {
    console.log(`  x DNS A record     does not resolve`);
  }

  // 3. nginx server block. This is the link that was missing.
  const vhostPath = nginxManager.vhostPath(hostname);
  const hasVhost = await nginxManager.hasVhost(hostname).catch(() => false);
  console.log(
    `  ${hasVhost ? "+" : "x"} nginx vhost      ${vhostPath}${hasVhost ? "" : "  (absent)"}`,
  );
  if (!hasVhost) {
    console.log(
      "      With no server block for this hostname, nginx answers from its default\n" +
        "      server — a bare 404 for visitors, and a 404 for the CA's validation\n" +
        "      request, which is why issuance fails. Provisioning now installs an\n" +
        "      HTTP-only block first to break exactly this loop; run:\n" +
        `        npm run ssl:provision -- --host ${hostname}`,
    );
  }

  // 4. Certificate on disk.
  const onDisk = await readCertificateOnDisk(hostname);
  const files = await hasCertificateFiles(hostname);
  if (onDisk) {
    const days = Math.floor((onDisk.notAfter.getTime() - Date.now()) / 86_400_000);
    console.log(
      `  + certificate      issuer="${onDisk.issuer ?? "?"}" expires ${onDisk.notAfter.toISOString().slice(0, 10)} (${days}d)`,
    );
    if (/STAGING|Fake/i.test(onDisk.issuer ?? "")) {
      console.log(
        "      This is a Let's Encrypt STAGING certificate. Browsers reject it.\n" +
          "      Set ACME_DIRECTORY=production, restart the app, then reissue with --force.",
      );
    }
  } else {
    console.log(`  x certificate      none at ${certificatePaths(hostname).certPath}`);
    if (files) console.log("      Files exist but could not be parsed.");
  }

  // 5. CAA.
  const caa = await checkCaa(hostname).catch(() => null);
  if (!caa) console.log("  ! CAA              lookup failed");
  else if (!caa.present) console.log("  + CAA              none (any CA may issue)");
  else
    console.log(
      `  ${caa.permitted ? "+" : "x"} CAA              at ${caa.foundAt}: ${caa.authorised.join(", ")}${caa.permitted ? "" : `   ${caa.message}`}`,
    );

  // 6. The request the CA will actually make.
  const reach = await checkChallengeReachability(hostname);
  console.log(
    `  ${reach.reachable ? "+" : reach.blocking ? "x" : "!"} ACME HTTP path   ${reach.detail}`,
  );

  // 7. What a visitor's browser sees.
  const report = await inspectCertificate(hostname);
  console.log(`  ${report.valid ? "+" : "x"} live HTTPS       ${report.summary}`);
  if (report.altNames.length > 0) {
    console.log(`      served certificate covers: ${report.altNames.join(", ")}`);
  }

  console.log(
    "\n  Read top to bottom and fix the first x. A missing nginx vhost explains\n" +
      "  both a 404 for visitors and a failed ACME validation at once.",
  );
}

main()
  .catch((err) => {
    console.error("\nProvisioning CLI failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
