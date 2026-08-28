/**
 * Verifies nginx vhost generation and its input validation.
 *
 * Worth testing directly because the blast radius is the whole box: a malformed
 * server block fails `nginx -t`, and one that slipped through a reload would take
 * every tenant site down simultaneously. Hostnames also arrive from tenant input
 * and are interpolated into a file nginx executes as configuration, so injection
 * is a real concern rather than a theoretical one.
 *
 * Pure string generation — no network, no filesystem, no nginx required.
 *
 * Run with: npm run verify:nginx
 */

try {
  process.loadEnvFile(".env");
} catch {
  // Already-populated environments are fine.
}

const {
  renderVhost,
  renderHttpOnlyVhost,
  vhostFilename,
  assertSafeHostname,
  VHOST_PREFIX,
} = await import("../src/server/services/nginx/vhostTemplate");

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  + ${name}`);
  else {
    failures += 1;
    console.error(`  x ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const base = {
  hostname: "clinic.com",
  certPath: "/var/www/storage/greviewpilot/certs/clinic.com/fullchain.pem",
  keyPath: "/var/www/storage/greviewpilot/certs/clinic.com/privkey.pem",
  upstream: "127.0.0.1:3000",
};

console.log("Hostname validation (rejects config injection):");
const badHostnames = [
  "clinic.com; return 301 http://evil.com",
  "clinic.com\nserver_name evil.com;",
  "clinic.com}\nserver{",
  "clinic.com $host",
  "../../etc/passwd",
  "clinic..com",
  "-clinic.com",
  "clinic.com-",
  "clinic",
  "",
  " ",
  `${"a".repeat(250)}.com`,
];
for (const hostname of badHostnames) {
  let threw = false;
  try {
    assertSafeHostname(hostname);
  } catch {
    threw = true;
  }
  check(`rejects ${JSON.stringify(hostname).slice(0, 46)}`, threw);
}

console.log("\nHostname validation (accepts legitimate names):");
for (const hostname of [
  "clinic.com",
  "www.clinic.com",
  "my-clinic.co.uk",
  "a.b.c.clinic.com",
  "clinic123.com",
  "CLINIC.COM",
]) {
  let threw = false;
  try {
    assertSafeHostname(hostname);
  } catch {
    threw = true;
  }
  check(`accepts ${hostname}`, !threw);
}

console.log("\nPath validation:");
for (const [label, patch] of [
  ["cert path with ;", { certPath: "/tmp/a.pem; rm -rf /" }],
  ["key path with newline", { keyPath: "/tmp/a.pem\nssl_verify_client off;" }],
  ["upstream with braces", { upstream: "127.0.0.1:3000}" }],
  ["cert path with $", { certPath: "/tmp/$host.pem" }],
] as const) {
  let threw = false;
  try {
    renderVhost({ ...base, ...patch });
  } catch {
    threw = true;
  }
  check(`rejects ${label}`, threw);
}

console.log("\nProxy vhost content:");
const proxy = renderVhost(base);
check("declares the hostname", proxy.includes("server_name clinic.com;"));
check("listens on 80 and 443", proxy.includes("listen 80;") && proxy.includes("listen 443 ssl;"));
check("references the certificate", proxy.includes(`ssl_certificate     ${base.certPath};`));
check("references the key", proxy.includes(`ssl_certificate_key ${base.keyPath};`));
check("proxies to the app", proxy.includes(`proxy_pass http://${base.upstream};`));
// middleware.ts identifies the tenant site from the Host header; rewriting it
// would serve the dashboard instead of the customer's website.
check("preserves the Host header", /proxy_set_header Host\s+\$host;/.test(proxy));
check("forwards the client IP", proxy.includes("X-Forwarded-For"));
check("forwards the scheme", proxy.includes("X-Forwarded-Proto $scheme"));
check("modern TLS only", proxy.includes("ssl_protocols       TLSv1.2 TLSv1.3;"));
check("sets HSTS", proxy.includes("Strict-Transport-Security"));
// A customer-owned domain is not ours to pin for the whole internet. Asserted
// against the directive itself rather than the file, so the surrounding comment
// explaining this decision does not satisfy its own test.
const hstsDirective = proxy
  .split("\n")
  .find((line) => line.trim().startsWith("add_header Strict-Transport-Security"));
check("HSTS directive exists", Boolean(hstsDirective), String(hstsDirective));
check(
  "HSTS does not preload or include subdomains",
  Boolean(hstsDirective) &&
    !hstsDirective!.includes("preload") &&
    !hstsDirective!.includes("includeSubDomains"),
  hstsDirective,
);
check("marks the file as managed", proxy.startsWith("# Managed by GReviewPilot"));

console.log("\nACME renewal path stays reachable (the 60-day trap):");
// If port 80 blanket-redirected to HTTPS, the first certificate would work and
// every renewal would fail two months later.
const acmeBlock = proxy.slice(proxy.indexOf("listen 80"), proxy.indexOf("listen 443"));
check(
  "challenge location is present on port 80",
  acmeBlock.includes("location ^~ /.well-known/acme-challenge/"),
);
check(
  "challenge is proxied, not redirected",
  /location \^~ \/\.well-known\/acme-challenge\/ \{[^}]*proxy_pass/s.test(acmeBlock),
);
check(
  "challenge location is matched before the catch-all redirect",
  acmeBlock.indexOf("acme-challenge") < acmeBlock.indexOf("return 308"),
);
check("other port-80 traffic is redirected to HTTPS", acmeBlock.includes("return 308 https://"));

console.log("\nHTTP-only bootstrap vhost (breaks the no-cert/no-vhost deadlock):");
// This block is what a domain gets between "DNS verified" and "certificate
// issued". Before it existed, a vhost was only written *after* issuance
// succeeded, but issuance needs /.well-known/acme-challenge/ to be reachable on
// that hostname — so with no vhost the CA got nginx's default-server 404, every
// attempt failed, and the domain sat CONNECTED while visitors saw
// "404 Not Found — nginx". Nothing, including the hourly retry, could break out.
const bootstrap = renderHttpOnlyVhost({ hostname: "clinic.com", upstream: base.upstream });
check("declares the hostname", bootstrap.includes("server_name clinic.com;"));
check("listens on port 80", bootstrap.includes("listen 80;"));
check(
  "has no TLS listener",
  !bootstrap.includes("listen 443") && !bootstrap.includes("ssl_certificate"),
  "referencing a certificate that does not exist yet makes nginx refuse to load",
);
check(
  "serves the ACME challenge path",
  bootstrap.includes("location ^~ /.well-known/acme-challenge/"),
);
check(
  "never redirects to HTTPS",
  !bootstrap.includes("return 308") && !bootstrap.includes("return 301"),
  "a redirect here would send visitors to a certificate that does not cover the host, and would break validation",
);
check("proxies ordinary traffic to the app", bootstrap.includes(`proxy_pass http://${base.upstream};`));
check("preserves the Host header", /proxy_set_header Host\s+\$host;/.test(bootstrap));
check("marks the file as managed", bootstrap.startsWith("# Managed by GReviewPilot"));
check(
  "occupies the same filename as the full vhost",
  vhostFilename("clinic.com") === "greviewpilot-clinic.com.conf",
  "the upgrade to HTTPS must replace this file, not sit alongside it as a duplicate server_name",
);
{
  let threw = false;
  try {
    renderHttpOnlyVhost({ hostname: "clinic.com; return 301 http://evil.com", upstream: base.upstream });
  } catch {
    threw = true;
  }
  check("rejects config injection in the hostname", threw);
}

console.log("\nAlias redirect vhost:");
const alias = renderVhost({ ...base, hostname: "www.clinic.com", redirectTo: "clinic.com" });
check("redirects to the primary host", alias.includes("return 308 https://clinic.com$request_uri;"));
check("still terminates TLS itself", alias.includes("ssl_certificate     "));
// The ACME location must still proxy — renewals for the alias validate through
// it — so the assertion is scoped to the TLS block, not the whole file.
check(
  "still serves ACME challenges",
  alias.includes("location ^~ /.well-known/acme-challenge/"),
);
const aliasTlsBlock = alias.slice(alias.indexOf("listen 443"));
check(
  "does not proxy ordinary traffic to the app",
  !aliasTlsBlock.includes("location / {"),
  aliasTlsBlock.includes("location / {") ? "found a proxying location /" : undefined,
);
let aliasThrew = false;
try {
  renderVhost({ ...base, redirectTo: "evil.com; return 200" });
} catch {
  aliasThrew = true;
}
check("validates the redirect target too", aliasThrew);

console.log("\nEffective-config inspection (why a correct vhost can still be bypassed):");
// Decisions are made on this parser's output, so it is asserted against a dump
// that reproduces the real failure: a second site on the same nginx, a stock
// default server, and our own vhost directory NOT included. Every symptom —
// visitors getting the other site, ACME returning 404, the wrong certificate
// being presented — follows from that last fact alone.
{
  const { parseServerBlocks, selectFor, nameMatches } = await import(
    "../src/server/services/nginx/nginxInspector.service"
  );

  const dump = `
# configuration file /etc/nginx/nginx.conf:
events {}
http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }
    include /etc/nginx/sites-enabled/*;
}

# configuration file /etc/nginx/sites-enabled/default:
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location ^~ /.well-known/ {
        proxy_pass http://127.0.0.1:3003;
    }
    location / {
        return 404;
    }
}

# configuration file /etc/nginx/sites-enabled/bookmytime:
server {
    listen 443 ssl default_server;
    server_name bookmytime.tech www.bookmytime.tech;
    ssl_certificate /etc/letsencrypt/live/bookmytime.tech/fullchain.pem;
    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
`;

  const blocks = parseServerBlocks(dump);
  check("finds every server block", blocks.length === 2, `${blocks.length}`);
  check(
    "attributes each block to the file nginx loaded it from",
    blocks[0].file === "/etc/nginx/sites-enabled/default" &&
      blocks[1].file === "/etc/nginx/sites-enabled/bookmytime",
    blocks.map((b) => b.file).join(" | "),
  );
  check(
    "reads server_name lists",
    blocks[1].serverNames.join(",") === "bookmytime.tech,www.bookmytime.tech",
    blocks[1].serverNames.join(","),
  );
  check("detects default_server", blocks[0].listens.some((l) => l.defaultServer));
  check(
    "recognises a /.well-known/ carve-out as covering acme-challenge",
    blocks[0].servesWellKnown && blocks[0].servesAcmeChallenge,
  );
  check("reads the certificate path", blocks[1].certificatePath?.includes("bookmytime") === true);
  check(
    "does not treat the catch-all server_name _ as a hostname match",
    !nameMatches("_", "greviewhub.com"),
  );

  // The diagnosis this has to produce for the reported failure.
  const on80 = selectFor(blocks, "greviewhub.com", "80");
  check(
    "no block claims an unincluded domain on port 80",
    on80.exact.length === 0 && on80.wildcard.length === 0,
  );
  check(
    "names the default server that answers it instead",
    on80.defaults[0]?.file === "/etc/nginx/sites-enabled/default",
    on80.defaults[0]?.file,
  );
  const on443 = selectFor(blocks, "greviewhub.com", "443");
  check(
    "explains the wrong certificate on 443",
    on443.exact.length === 0 &&
      on443.defaults[0]?.certificatePath?.includes("bookmytime") === true,
    "the TLS default_server presents its own certificate for any unmatched host",
  );

  // Upstream collision: nginx routes the hostname perfectly and still serves the
  // wrong product, because the port it forwards to belongs to another app. This
  // is invisible from the application side and from nginx's own error log, so the
  // per-block proxy_pass has to be recoverable in order to report it.
  const shared = parseServerBlocks(`
# configuration file /etc/nginx/sites-enabled/primeinbox:
server {
    listen 80;
    server_name primeinbox.example;
    location / {
        proxy_pass http://127.0.0.1:3003;
    }
}
# configuration file /etc/nginx/greviewpilot-sites/greviewpilot-greviewhub.com.conf:
server {
    listen 80;
    server_name greviewhub.com;
    location / {
        proxy_pass http://127.0.0.1:3003;
    }
}
`);
  check(
    "collects proxy_pass per server block",
    shared.every((b) => b.proxyPasses.includes("http://127.0.0.1:3003")),
    shared.map((b) => b.proxyPasses.join()).join(" | "),
  );
  {
    // The same grouping the CLI reports, asserted here so the detection cannot
    // silently stop working.
    const byUpstream = new Map<string, Set<string>>();
    for (const block of shared) {
      for (const target of block.proxyPasses) {
        const key = target.replace(/^https?:\/\//, "");
        if (!byUpstream.has(key)) byUpstream.set(key, new Set());
        byUpstream.get(key)!.add(block.serverNames.join(","));
      }
    }
    check(
      "detects one upstream shared by two different sites",
      byUpstream.get("127.0.0.1:3003")?.size === 2,
      [...(byUpstream.get("127.0.0.1:3003") ?? [])].join(" + "),
    );
  }

  // Conflicting server_name: nginx keeps the first and ignores the rest.
  const conflict = parseServerBlocks(`
# configuration file /etc/nginx/sites-enabled/other:
server {
    listen 80;
    server_name greviewhub.com;
}
# configuration file /etc/nginx/greviewpilot-sites/greviewpilot-greviewhub.com.conf:
server {
    listen 80;
    server_name greviewhub.com;
}
`);
  const conflicted = selectFor(conflict, "greviewhub.com", "80");
  check("detects two blocks claiming one hostname", conflicted.conflicting);
  check(
    "reports the first-loaded block as the winner",
    conflicted.exact[0].file === "/etc/nginx/sites-enabled/other",
    conflicted.exact[0].file,
  );

  // listen specificity: the socket is chosen before server_name is consulted.
  const bound = parseServerBlocks(`
# configuration file /etc/nginx/sites-enabled/pinned:
server {
    listen 77.37.47.89:80;
    server_name pinned.example;
}
`);
  check(
    "surfaces explicit bind addresses as a selection hazard",
    selectFor(bound, "anything.example", "80").explicitAddresses.join(",") === "77.37.47.89",
  );
  check(
    "treats a wildcard listen as having no explicit address",
    selectFor(blocks, "anything.example", "80").explicitAddresses.length === 0,
  );
}

console.log("\nFilenames:");
check("prefixed so unrelated vhosts are never touched", vhostFilename("clinic.com").startsWith(VHOST_PREFIX));
check("filename matches the hostname", vhostFilename("clinic.com") === "greviewpilot-clinic.com.conf");
check("filename is lowercased", vhostFilename("CLINIC.com") === "greviewpilot-clinic.com.conf");

console.log("\nPlatform hostname resolution:");
const { platformHostnames } = await import("../src/server/services/sslProvisioning.service");
{
  // With no explicit config, the primary is derived from APP_URL and the www
  // counterpart is included by default.
  const { primary, aliases } = platformHostnames();
  check("primary is derived from APP_URL", primary.length > 0, primary);
  check(
    "www counterpart is included by default",
    aliases.some((a) => a === `www.${primary}`),
    aliases.join(","),
  );
  check("primary itself is never listed as its own alias", !aliases.includes(primary));
}

console.log("\nUpstream must never point back at nginx (proxy loop):");
// The upstream used to be inferred from APP_URL. With a production
// `https://app.example.com` that resolved to port 443, so every tenant vhost
// proxied plain HTTP into nginx's own TLS listener. It is now explicit
// configuration, validated in env.ts, and asserted here.
for (const port of ["80", "443"]) {
  const looping = renderVhost({ ...base, upstream: `127.0.0.1:${port}` });
  check(
    `port ${port} upstream is detectable in output`,
    looping.includes(`proxy_pass http://127.0.0.1:${port};`),
    "generator should still render it — env.ts is what rejects it",
  );
}
const { env: loadedEnv } = await import("../src/server/utils/env");
const upstreamPort = loadedEnv.APP_UPSTREAM.split(":")[1];
check(
  `configured APP_UPSTREAM (${loadedEnv.APP_UPSTREAM}) is not an nginx port`,
  !["80", "443"].includes(upstreamPort ?? ""),
  loadedEnv.APP_UPSTREAM,
);
check(
  "generated config uses the configured upstream",
  renderVhost({ ...base, upstream: loadedEnv.APP_UPSTREAM }).includes(
    `proxy_pass http://${loadedEnv.APP_UPSTREAM};`,
  ),
);

console.log("\nDeterminism:");
check("same input produces identical output", renderVhost(base) === renderVhost(base));

console.log(failures === 0 ? "\nAll nginx checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
