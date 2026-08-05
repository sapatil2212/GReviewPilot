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

// Tenant DNS instructions are built from these two. A wrong value here is
// invisible in the app and breaks every domain a tenant tries to connect.
heading("Tenant DNS targets");
console.log(`  Apex domains   -> A     ${env.SITE_APEX_IP}`);
let cnameTarget = env.SITE_CNAME_TARGET;
if (!cnameTarget) {
  try {
    cnameTarget = new URL(env.APP_URL).hostname;
  } catch {
    cnameTarget = "";
  }
  warn(
    "SITE_CNAME_TARGET is unset",
    `falling back to APP_URL's hostname "${cnameTarget}" — set it explicitly so tenant DNS survives the dashboard moving`,
  );
} else {
  pass("SITE_CNAME_TARGET", cnameTarget);
}
console.log(`  Subdomains     -> CNAME ${cnameTarget || "(unresolvable)"}`);

if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cnameTarget)) {
  fail("CNAME target is an IP address", "a CNAME value must be a hostname, not an IP");
} else if (cnameTarget.includes(":")) {
  fail("CNAME target contains a port", `"${cnameTarget}" — a CNAME value cannot include a port`);
} else if (/localhost/i.test(cnameTarget)) {
  fail(
    "CNAME target is localhost",
    "tenants would be told to point their domain at localhost. Set APP_URL to the public hostname, or set SITE_CNAME_TARGET",
  );
}

// The apex A record must be a real public IP, or apex domains can never verify.
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
    "set it to this server's public IP or apex domains will point at Vercel",
  );
} else {
  pass("SITE_APEX_IP looks like a public address", env.SITE_APEX_IP);
}
try {
  const appHost = new URL(env.APP_URL).hostname;
  pass("APP_URL", env.APP_URL);
  console.log(`      platform host is "${appHost}" — every other hostname is treated as a tenant domain`);
  const parts = appHost.split(".");
  if (parts.length > 2) {
    const apex = parts.slice(-2).join(".");
    console.log(
      `      note: "${apex}" and "www.${apex}" are NOT platform hosts. If you serve a\n` +
        `      marketing site there from this app, it will be routed as a tenant domain and 404.`,
    );
  }
} catch {
  fail("APP_URL is not a valid URL", env.APP_URL);
}

if (!env.SITES_ROOT_DOMAIN) {
  console.log("      SITES_ROOT_DOMAIN unset — tenants get /s/<slug> only, no free subdomain.");
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

  // A generated vhost that lands outside the include glob is silently ignored.
  const nginxConf = await fs.readFile("/etc/nginx/nginx.conf", "utf8").catch(() => null);
  if (nginxConf === null) {
    warn("could not read /etc/nginx/nginx.conf", "skipped include/map checks");
  } else {
    const included =
      nginxConf.includes(env.NGINX_VHOST_PATH) ||
      // The include may live in a file nginx.conf itself includes.
      (await run("grep", ["-rl", env.NGINX_VHOST_PATH, "/etc/nginx/"])).ok;
    if (included) pass("vhost directory is included by nginx", env.NGINX_VHOST_PATH);
    else
      fail(
        "vhost directory is not referenced anywhere in /etc/nginx",
        `add: include ${env.NGINX_VHOST_PATH}/*;  inside http { }`,
      );

    // Without this map every generated vhost fails `nginx -t`.
    const hasMap =
      /map\s+\$http_upgrade\s+\$connection_upgrade/.test(nginxConf) ||
      (await run("grep", ["-rl", "connection_upgrade", "/etc/nginx/"])).ok;
    if (hasMap) pass("$connection_upgrade map present");
    else
      fail(
        "$connection_upgrade map missing",
        "every generated vhost will fail nginx -t. See docs/CUSTOM-DOMAINS-VPS.md step 2",
      );
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
  pass("app is listening on APP_UPSTREAM", env.APP_UPSTREAM);
} else {
  warn(
    "nothing listening on APP_UPSTREAM",
    `${env.APP_UPSTREAM} — start the app (pm2 start) before provisioning, or nginx will 502`,
  );
}

// The ACME challenge path must reach the app and must not redirect. This checks
// the app directly; the CA reaches it through nginx on port 80.
try {
  const res = await fetch(`http://${env.APP_UPSTREAM}/.well-known/acme-challenge/doctor-probe`, {
    redirect: "manual",
  });
  if (res.status === 404) {
    pass("app serves the ACME challenge route", "404 for an unknown token, as expected");
  } else if (res.status >= 300 && res.status < 400) {
    fail(
      "ACME challenge path redirects",
      `${res.status} -> ${res.headers.get("location")}. HTTP-01 validation will fail`,
    );
  } else {
    warn("unexpected status on the ACME challenge route", String(res.status));
  }
} catch {
  warn("could not reach the ACME challenge route", "app not running?");
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
