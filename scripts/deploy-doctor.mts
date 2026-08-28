/**
 * Deployment preflight.
 *
 * Run on the VPS before provisioning anything. `ssl:provision --check` prints
 * configuration; this actually exercises it — writes to each directory, runs the
 * nginx reload helper, opens a socket to the app, queries the database. Every
 * check here corresponds to something that otherwise fails later with a message
 * that does not point at the cause.
 *
 * Read-only apart from writing and deleting one temp file per directory it is
 * asked to verify.
 *
 * Run with: npm run doctor
 */

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  // Already-populated environments are fine.
}

const { env } = await import("../src/server/utils/env");

const onLinux = os.platform() === "linux";
let failures = 0;
let warnings = 0;

function pass(name: string, detail?: string) {
  console.log(`  \u2713 ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail?: string) {
  failures += 1;
  console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name: string, detail?: string) {
  warnings += 1;
  console.log(`  ! ${name}${detail ? ` — ${detail}` : ""}`);
}
/** Off-server runs cannot check server paths; report without counting a failure. */
function skip(name: string, why: string) {
  console.log(`  - ${name} — skipped (${why})`);
}
function heading(text: string) {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

// =====================================================================
heading("Environment");

if (env.NODE_ENV !== "production") {
  warn("NODE_ENV is not production", env.NODE_ENV);
} else {
  pass("NODE_ENV=production");
}

// A predictable cron secret means anyone can trigger the scheduled jobs, and the
// routes are enabled the moment it is non-empty.
if (!env.CRON_SECRET) {
  warn("CRON_SECRET is unset", "renewal job is disabled; /api/cron/* returns 503");
} else if (/CHANGE|SECRET|EXAMPLE|PLACEHOLDER|xxx/i.test(env.CRON_SECRET)) {
  fail(
    "CRON_SECRET is still a placeholder",
    "anyone can trigger cron. Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
} else if (env.CRON_SECRET.length < 32) {
  warn("CRON_SECRET is short", `${env.CRON_SECRET.length} chars; use 64 hex`);
} else {
  pass("CRON_SECRET looks generated", `${env.CRON_SECRET.length} chars`);
}

if (env.SSL_PROVISIONING === "nginx") {
  pass("SSL_PROVISIONING=nginx");
} else {
  warn("SSL_PROVISIONING is off", "certificates will be observed but never issued");
}

if (env.ACME_DIRECTORY === "staging") {
  warn(
    "ACME_DIRECTORY=staging",
    "certificates will NOT be browser-trusted. Correct for a first run; switch to production after a successful staging issuance",
  );
} else {
  pass("ACME_DIRECTORY=production");
}

if (env.ACME_CONTACT_EMAIL) pass("ACME_CONTACT_EMAIL set", env.ACME_CONTACT_EMAIL);
else warn("ACME_CONTACT_EMAIL unset", "the CA cannot warn you if renewals stop");

// The bug this catches: APP_URL is the public HTTPS address, which behind nginx
// is nginx itself. Proxying there loops.
pass("APP_UPSTREAM", env.APP_UPSTREAM);

if (!env.SITES_ROOT_DOMAIN) {
  console.log("  SITES_ROOT_DOMAIN unset — tenants get /s/<slug> only, no free subdomain.");
}

// =====================================================================
heading("Platform hostname (APP_URL)");

// APP_URL's hostname is THE platform host — every other hostname reaching this
// app is routed as a tenant custom domain (middleware.ts isPlatformHost()) and
// gets no dashboard, no marketing pages, nothing except /s/<slug> lookups. If it
// does not resolve, or resolves to a different server, the app is unreachable at
// its own address regardless of how correctly everything else is configured —
// this is the exact failure that motivated this check.
let platformHostname = "";
try {
  platformHostname = new URL(env.APP_URL).hostname;
} catch {
  fail("APP_URL is not a valid URL", env.APP_URL);
}

if (platformHostname) {
  console.log(`  ${env.APP_URL}, platform host = "${platformHostname}"`);

  const parts = platformHostname.split(".");
  if (parts.length > 2) {
    const apexOfPlatform = parts.slice(-2).join(".");
    console.log(
      `  Note: "${apexOfPlatform}" and "www.${apexOfPlatform}" are DIFFERENT hostnames from\n` +
        `  the platform host above. If this app also serves a marketing site there, that\n` +
        `  hostname needs to be the platform host (APP_URL) — not a second, separate one —\n` +
        `  because middleware routes everything that is not the platform host as a tenant\n` +
        `  custom domain and 404s it.`,
    );
  }

  const dns = await import("node:dns/promises");
  const resolver = new dns.Resolver({ timeout: 4000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  try {
    const addrs = await resolver.resolve4(platformHostname);
    pass(`${platformHostname} resolves publicly`, addrs.join(", "));
    if (env.SITE_APEX_IP && /^\d{1,3}(\.\d{1,3}){3}$/.test(env.SITE_APEX_IP) && !addrs.includes(env.SITE_APEX_IP)) {
      warn(
        "platform hostname does not resolve to SITE_APEX_IP",
        `${platformHostname} -> ${addrs.join(", ")}, but SITE_APEX_IP=${env.SITE_APEX_IP}. ` +
          "Expected when they are genuinely different servers; otherwise this is a mismatch.",
      );
    }
  } catch {
    fail(
      `${platformHostname} does not resolve (publicly, via 1.1.1.1/8.8.8.8)`,
      "the app is unreachable at its own address from the public internet. Point an " +
        "A record at this server's public IP, or change APP_URL to a hostname that already does.",
    );
  }

  if (env.SSL_PROVISIONING === "nginx") {
    const { platformHostnames } = await import("../src/server/services/sslProvisioning.service");
    const { primary, aliases } = platformHostnames();
    pass("platform certificate will cover", [primary, ...aliases].join(", "));
    console.log(
      "  Provisioned automatically by the hourly monitor and by: npm run ssl:provision -- --platform",
    );
  }
}

// =====================================================================
heading("Tenant DNS targets");

// These are what tenants are told to create. A wrong value here is invisible in
// the app itself and breaks every domain a tenant tries to connect — it only
// shows up as "propagating forever" in the dashboard, days later.
console.log(`  Root domains  -> A     ${env.SITE_APEX_IP}`);
let cnameTarget = env.SITE_CNAME_TARGET;
if (!cnameTarget) {
  cnameTarget = platformHostname;
  warn(
    "SITE_CNAME_TARGET is unset",
    `falling back to APP_URL's hostname "${cnameTarget}" — set it explicitly so tenant DNS survives the dashboard moving`,
  );
} else {
  pass("SITE_CNAME_TARGET", cnameTarget);
}
console.log(`  Subdomains    -> CNAME ${cnameTarget || "(unresolvable)"}`);

if (!cnameTarget) {
  fail("no usable CNAME target", "neither SITE_CNAME_TARGET nor APP_URL produced one");
} else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cnameTarget)) {
  fail("CNAME target is an IP address", "a CNAME value must be a hostname, not an IP");
} else if (cnameTarget.includes(":")) {
  fail("CNAME target contains a port", `"${cnameTarget}" — a CNAME value cannot include a port`);
} else if (/localhost/i.test(cnameTarget)) {
  fail(
    "CNAME target is localhost",
    "tenants would be told to point their domain at localhost. Set APP_URL to the public hostname, or set SITE_CNAME_TARGET",
  );
}

if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(env.SITE_APEX_IP)) {
  fail("SITE_APEX_IP is not an IPv4 address", env.SITE_APEX_IP);
} else if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(env.SITE_APEX_IP)) {
  fail(
    "SITE_APEX_IP is a private address",
    `${env.SITE_APEX_IP} — tenants cannot reach it from the internet`,
  );
} else if (env.SITE_APEX_IP === "76.76.21.21") {
  fail(
    "SITE_APEX_IP is still the Vercel default",
    "set it to this server's public IP or root-domain tenants will point at Vercel",
  );
} else {
  pass("SITE_APEX_IP looks like a public address", env.SITE_APEX_IP);
}

// =====================================================================
heading("Storage directories");

/**
 * Report on a directory without creating it.
 *
 * A diagnostic that creates what it is checking hides the very problem it exists
 * to find, and leaves directories behind on whatever machine it was run from. The
 * only write is a self-deleting probe file inside a directory that already exists,
 * because writability cannot be inferred from mode bits once ownership and
 * supplementary groups are involved.
 *
 * `createdByApp` marks directories the application makes on demand, so a missing
 * one is a warning rather than a failure — provided the parent is writable.
 */
async function checkDir(label: string, dir: string, opts: { createdByApp?: boolean } = {}) {
  if (!onLinux && dir.startsWith("/")) {
    skip(`${label} (${dir})`, "absolute server path, not on this machine");
    return;
  }

  const stat = await fs.stat(dir).catch(() => null);

  if (stat === null) {
    const parent = path.posix.dirname(dir);
    const parentStat = await fs.stat(parent).catch(() => null);
    if (!opts.createdByApp) {
      fail(`${label} does not exist`, `${dir} — create it and chown to the app user`);
      return;
    }
    if (parentStat === null) {
      fail(`${label} missing and its parent does not exist either`, dir);
      return;
    }
    // Probe the parent so "creatable" is a tested claim, not an assumption.
    const parentProbe = path.posix.join(parent, `.doctor-${Date.now()}`);
    try {
      await fs.writeFile(parentProbe, "ok");
      await fs.rm(parentProbe, { force: true });
      warn(`${label} does not exist yet`, `${dir} — the app will create it on first use`);
    } catch {
      fail(`${label} missing and the parent is not writable`, `${dir}`);
    }
    return;
  }

  if (!stat.isDirectory()) {
    fail(`${label} is not a directory`, dir);
    return;
  }

  const probe = path.posix.join(dir, `.doctor-${Date.now()}`);
  try {
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
    pass(`${label} writable`, dir);
  } catch (err) {
    fail(`${label} NOT writable by this user`, `${dir}: ${(err as Error).message}`);
  }
}

await checkDir("STORAGE_LOCAL_PATH", env.STORAGE_LOCAL_PATH, { createdByApp: true });
// Absent from the documented storage tree — the app creates it on the first
// website-builder upload, but better to know now than on a tenant's first image.
await checkDir("WEBSITE_MEDIA_PATH", env.WEBSITE_MEDIA_PATH, { createdByApp: true });
// These two must pre-exist with restricted ownership: the account key can revoke
// every certificate we hold, so it is not something to create implicitly.
await checkDir("SSL_CERT_PATH", env.SSL_CERT_PATH);
await checkDir("ACME account dir", path.posix.dirname(env.ACME_ACCOUNT_KEY_PATH));
await checkDir("NGINX_VHOST_PATH", env.NGINX_VHOST_PATH);

// =====================================================================
heading("nginx");

function run(command: string, args: string[], timeout = 30_000) {
  return new Promise<{ ok: boolean; out: string }>((resolve) => {
    execFile(command, args, { timeout }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout}${stderr}`.trim() });
    });
  });
}

if (!onLinux) {
  skip("nginx reload helper", "not a Linux host");
} else {
  const parts = env.NGINX_RELOAD_COMMAND.trim().split(/\s+/);
  const [command, ...args] = parts;
  // This single check covers the sudoers entry, the helper script, its
  // permissions, and `nginx -t` over the whole live config.
  const result = await run(command!, args);
  if (result.ok) {
    pass("reload helper runs and nginx config is valid", env.NGINX_RELOAD_COMMAND);
  } else {
    fail(
      "reload helper failed",
      `${env.NGINX_RELOAD_COMMAND}\n      ${result.out.slice(0, 500)}`,
    );
    if (/password|sudo:/i.test(result.out)) {
      console.log("      Looks like sudo is prompting. Check /etc/sudoers.d and the app user.");
    }
  }

  // Everything below reads `nginx -T`, the config as nginx actually assembled it.
  //
  // This used to grep /etc/nginx instead, and that was worse than useless: a
  // sites-available file that is not symlinked into sites-enabled matches every
  // grep and is loaded by nothing, so an `include` line pasted there reported a
  // confident ✓ while generated vhosts were being ignored — the exact condition
  // that makes a CONNECTED domain serve somebody else's site.
  const { dumpEffectiveConfig, selectFor, includesVhostDirectory } = await import(
    "../src/server/services/nginx/nginxInspector.service"
  );

  let effective: Awaited<ReturnType<typeof dumpEffectiveConfig>> | null = null;
  try {
    effective = await dumpEffectiveConfig();
  } catch (err) {
    warn(
      "could not run `nginx -T`",
      `${(err as Error).message} — run doctor as root for the include, map and ` +
        "hostname-collision checks",
    );
  }

  if (effective) {
    if (includesVhostDirectory(effective)) {
      pass("vhost directory is in nginx's effective config", env.NGINX_VHOST_PATH);
    } else {
      const referenced = effective.raw.includes(env.NGINX_VHOST_PATH);
      fail(
        "nginx has NOT loaded any file from the vhost directory",
        `${env.NGINX_VHOST_PATH} — every generated vhost is being ignored, so those ` +
          "domains are served by whichever other site nginx matches. " +
          (referenced
            ? "The include line is present but matched no files at load time; reload nginx."
            : `Add inside http { }: include ${env.NGINX_VHOST_PATH}/*;`),
      );
    }

    // Without this map every generated vhost fails `nginx -t`.
    if (/map\s+\$http_upgrade\s+\$connection_upgrade/.test(effective.raw)) {
      pass("$connection_upgrade map present");
    } else {
      fail(
        "$connection_upgrade map missing",
        "every generated vhost will fail nginx -t. See docs/CUSTOM-DOMAINS-VPS.md step 2",
      );
    }

    // A default server that answers unknown hostnames with a plain 404 is correct
    // for visitors but wrong for the two well-known paths: the ACME challenge and
    // the routing probe. Both are fetched on a hostname that may not have a vhost
    // yet, which is the only way a CNAME or Cloudflare-proxied domain can prove
    // it reaches this server.
    const port80Defaults = effective.blocks.filter((b) =>
      b.listens.some((l) => l.port === "80" && l.defaultServer),
    );
    if (port80Defaults.length === 0) {
      warn(
        "no default_server on port 80",
        "any domain pointed at this IP is served by whichever block nginx matches " +
          "first. See docs/CUSTOM-DOMAINS-VPS.md step 3",
      );
    } else if (port80Defaults.some((b) => b.servesWellKnown || b.servesAcmeChallenge)) {
      pass(
        "default server forwards the well-known path",
        port80Defaults.map((b) => b.file).join(", "),
      );
    } else {
      warn(
        "default server does not forward /.well-known/",
        `${port80Defaults.map((b) => b.file).join(", ")} — a domain with no vhost of its ` +
          "own cannot answer the routing probe, so CNAME and proxied (Cloudflare) " +
          "domains may never verify. Add the carve-out from step 3",
      );
    }

    // Other sites sharing this nginx are the reason a correct vhost can still be
    // bypassed, so name them rather than leaving them as a surprise.
    const foreign = effective.blocks.filter(
      (b) => !b.file.startsWith(env.NGINX_VHOST_PATH) && b.serverNames.some((n) => n !== "_"),
    );
    if (foreign.length > 0) {
      console.log(
        `  Other sites on this nginx: ${Array.from(
          new Set(foreign.flatMap((b) => b.serverNames.filter((n) => n !== "_"))),
        ).join(", ")}`,
      );
    }

    const mixedBinds = selectFor(effective.blocks, "example.invalid", "80").explicitAddresses;
    if (mixedBinds.length > 0) {
      warn(
        "port 80 has explicit bind addresses",
        `${mixedBinds.join(", ")} — nginx selects the listening socket before server_name, ` +
          "so generated vhosts using a wildcard `listen 80` are not in that group and will " +
          "never be consulted for requests arriving on those addresses",
      );
    }
  }

  // Generated vhosts that are on disk but not loadable are invisible otherwise.
  const vhostFiles = await fs.readdir(env.NGINX_VHOST_PATH).catch(() => null);
  if (vhostFiles === null) {
    skip("generated vhosts", `cannot read ${env.NGINX_VHOST_PATH}`);
  } else {
    const generated = vhostFiles.filter((f) => f.startsWith("greviewpilot-"));
    if (generated.length === 0) {
      console.log(
        `  No generated vhosts yet in ${env.NGINX_VHOST_PATH}. Expected until the first\n` +
          "  domain is verified — every CONNECTED domain should have one, and a CONNECTED\n" +
          "  domain without one is served by the default server (a 404).",
      );
    } else {
      pass(`${generated.length} generated vhost(s) present`, env.NGINX_VHOST_PATH);
      const bootstrapOnly: string[] = [];
      for (const file of generated) {
        const body = await fs
          .readFile(path.posix.join(env.NGINX_VHOST_PATH, file), "utf8")
          .catch(() => "");
        if (body && !body.includes("listen 443")) bootstrapOnly.push(file);
      }
      if (bootstrapOnly.length > 0) {
        warn(
          `${bootstrapOnly.length} domain(s) still on the HTTP-only bootstrap vhost`,
          `${bootstrapOnly.join(", ")} — live over HTTP but no certificate yet. Run: ` +
            "npm run ssl:provision -- --diagnose <hostname>",
        );
      }
    }
  }
}

// =====================================================================
heading("Connected domains without a vhost");

// The failure that motivated this check: a domain verifies, the dashboard shows
// CONNECTED, and visitors get "404 Not Found — nginx" because no server block was
// ever written for it. Nothing in the UI surfaced the gap, and the hourly job
// could not close it, because a vhost used to be written only after a certificate
// had been issued — and issuance needed the vhost to exist.
if (!onLinux) {
  skip("connected-domain vhost audit", "nginx paths are not on this machine");
} else if (env.SSL_PROVISIONING !== "nginx") {
  skip("connected-domain vhost audit", "SSL_PROVISIONING is not nginx");
} else {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const connected = await prisma.siteDomain.findMany({
      where: { status: "CONNECTED" },
      select: { hostname: true, sslStatus: true },
    });
    await prisma.$disconnect();

    if (connected.length === 0) {
      console.log("  No CONNECTED custom domains yet.");
    } else {
      const { nginxManager } = await import(
        "../src/server/services/nginx/nginxManager.service"
      );
      const { dumpEffectiveConfig, selectFor } = await import(
        "../src/server/services/nginx/nginxInspector.service"
      );
      const live = await dumpEffectiveConfig().catch(() => null);

      const missing: string[] = [];
      // A file on disk is not the same as a hostname nginx serves. Checking only
      // for the file reported ✓ for a domain that nginx was ignoring, which is
      // precisely the state that looked like an application bug.
      const hijacked: string[] = [];

      for (const domain of connected) {
        const has = await nginxManager.hasVhost(domain.hostname).catch(() => false);
        if (!has) {
          missing.push(domain.hostname);
          continue;
        }
        if (!live) continue;
        const expected = nginxManager.vhostPath(domain.hostname);
        const winner = selectFor(live.blocks, domain.hostname, "80");
        const serving = (winner.exact[0] ?? winner.wildcard[0] ?? winner.defaults[0])?.file;
        if (serving !== expected) {
          hijacked.push(`${domain.hostname} -> ${serving ?? "nginx built-in default"}`);
        }
      }

      if (missing.length > 0) {
        fail(
          `${missing.length} connected domain(s) have NO nginx vhost`,
          `${missing.join(", ")} — these hostnames 404 for visitors right now. Fix with: ` +
            "npm run ssl:provision -- --all",
        );
      }
      if (hijacked.length > 0) {
        fail(
          `${hijacked.length} connected domain(s) have a vhost that nginx is NOT using`,
          `${hijacked.join(", ")} — visitors get that other site instead, and ACME ` +
            "validation 404s. Diagnose with: npm run ssl:provision -- --nginx <hostname>",
        );
      }
      if (missing.length === 0 && hijacked.length === 0) {
        pass(
          `all ${connected.length} connected domain(s) are served by their own vhost`,
          live ? undefined : "vhost files present (run as root to confirm nginx uses them)",
        );
      }
    }
  } catch (err) {
    warn("could not audit connected domains", (err as Error).message.split("\n")[0]);
  }
}

// =====================================================================
heading("Connectivity");

function tcpProbe(hostport: string, timeout = 5000) {
  return new Promise<boolean>((resolve) => {
    const [host, port] = hostport.split(":");
    const socket = net.connect({ host, port: Number(port) });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

if (await tcpProbe(env.APP_UPSTREAM)) {
  console.log(`  something is listening on ${env.APP_UPSTREAM} — identifying it below`);
} else {
  fail(
    "nothing listening on APP_UPSTREAM",
    `${env.APP_UPSTREAM} — start the app (pm2 start) or nginx will 502 every custom domain`,
  );
}

// Identity, not liveness.
//
// This check used to fetch an unknown ACME token and treat 404 as success. Every
// Next.js app answers 404 for an unknown path, so a port belonging to a
// completely different application on the same box passed with a tick — and nginx
// then proxied every tenant's custom domain into that other app. Visitors got
// somebody else's website and ACME validation 404'd, in a way that looked like an
// nginx routing fault for days. A sentinel written to this app's database and read
// back through the upstream can only be answered by the real app.
try {
  const { checkUpstreamIdentity } = await import(
    "../src/server/services/acme/challengeReachability"
  );
  const identity = await checkUpstreamIdentity();
  if (identity.confirmed) {
    pass("APP_UPSTREAM is this application", env.APP_UPSTREAM);
  } else {
    fail("APP_UPSTREAM is NOT this application", identity.detail);
  }
} catch (err) {
  warn("could not verify APP_UPSTREAM identity", (err as Error).message.split("\n")[0]);
}

try {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  // MySQL returns integers as BigInt, which JSON.stringify refuses to serialize.
  // Formatting the row naively made a reachable database look like a failure.
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT 1 AS ok");
  const value = rows[0]?.ok;
  pass("database reachable", `SELECT 1 -> ${String(value)}`);
  const pending = await prisma.acmeChallenge.count();
  pass("AcmeChallenge table exists", `${pending} pending challenge row(s)`);
  await prisma.$disconnect();
} catch (err) {
  fail("database check failed", (err as Error).message.split("\n")[0]);
}

// =====================================================================
heading("Configuration that is set but not used");

// These were added to .env by hand. The codebase routes all media through
// STORAGE_LOCAL_PATH plus WEBSITE_MEDIA_PATH, so the rest are inert — worth
// saying out loud so nobody assumes uploads are landing in them.
const inert = [
  "AVATARS_PATH",
  "BUSINESS_LOGOS_PATH",
  "REVIEW_IMAGES_PATH",
  "QR_CODES_PATH",
  "EXPORTS_PATH",
  "IMPORTS_PATH",
  "REPORTS_PATH",
  "TEMP_PATH",
  "AI_CACHE_PATH",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
].filter((key) => process.env[key]);

if (inert.length === 0) {
  pass("no unused variables detected");
} else {
  console.log("  These are set but nothing reads them (harmless, but not doing what they look like):");
  for (const key of inert) console.log(`      ${key}`);
  console.log(
    "\n      Media is stored under STORAGE_LOCAL_PATH, namespaced per tenant and\n" +
      "      category automatically; website-builder images go to WEBSITE_MEDIA_PATH.\n" +
      "      The DB_* values are unused because DATABASE_URL carries all of them.",
  );
}

// =====================================================================
heading("Result");

if (failures === 0 && warnings === 0) {
  console.log("  All checks passed. Proceed with: npm run ssl:provision -- --preview <domain>");
} else {
  console.log(`  ${failures} failure(s), ${warnings} warning(s).`);
  if (failures > 0) console.log("  Fix failures before provisioning certificates.");
}
if (!onLinux) {
  console.log("\n  Not running on Linux — server-path and nginx checks were skipped.");
  console.log("  Run this on the VPS for a complete result.");
}

process.exitCode = failures === 0 ? 0 : 1;
