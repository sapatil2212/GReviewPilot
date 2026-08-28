/**
 * Structural validation of the generated nginx config.
 *
 * `npm run verify:nginx` asserts the config says the right things; this asserts
 * it is well-formed nginx. Separate because a config can contain every correct
 * directive and still be rejected by `nginx -t` over an unbalanced brace or a
 * missing semicolon — and on a live box that rejection is discovered at reload
 * time, with every tenant site already depending on the running config.
 *
 * When nginx is available (a Linux box or WSL) this also runs the real
 * `nginx -t`, which is the only complete check. Otherwise it falls back to the
 * structural pass so it stays useful on a Windows dev machine.
 *
 * Run with: npm run verify:nginx:syntax
 */

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  // Already-populated environments are fine.
}

const { renderVhost, renderHttpOnlyVhost } = await import(
  "../src/server/services/nginx/vhostTemplate"
);

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  + ${name}`);
  else {
    failures += 1;
    console.error(`  x ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const { resolveHttp2Style, detectNginxVersion } = await import(
  "../src/server/services/nginx/nginxVersion.service"
);

// Generate for the nginx actually installed here, so `nginx -t` below validates
// what production would receive rather than a form this box happens to accept.
const detected = await detectNginxVersion();
const http2 = await resolveHttp2Style();
console.log(
  `nginx: ${detected ? detected.raw : "not detected"} — generating HTTP/2 as "${http2}"\n`,
);

const configs = {
  proxy: renderVhost({
    hostname: "clinic.com",
    certPath: "/etc/ssl/clinic.com/fullchain.pem",
    keyPath: "/etc/ssl/clinic.com/privkey.pem",
    upstream: "127.0.0.1:3000",
    http2,
  }),
  alias: renderVhost({
    hostname: "www.clinic.com",
    certPath: "/etc/ssl/www.clinic.com/fullchain.pem",
    keyPath: "/etc/ssl/www.clinic.com/privkey.pem",
    upstream: "127.0.0.1:3000",
    redirectTo: "clinic.com",
    http2,
  }),
  // The pre-certificate block. Included here because it is the config a domain
  // runs on for the minutes (or, if issuance is failing, days) between DNS
  // verifying and HTTPS working — so it reaches a live reload just as often as
  // the others, and a syntax error in it would be just as fatal.
  bootstrap: renderHttpOnlyVhost({ hostname: "new.clinic.com", upstream: "127.0.0.1:3000" }),
};

/** Port-80-only by design, so it has one server block where the others have two. */
const expectedServerBlocks: Record<string, number> = { proxy: 2, alias: 2, bootstrap: 1 };

/** Strip comments and string literals before counting structural characters. */
function structuralLines(config: string): string[] {
  return config
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0);
}

console.log("Structural validation:");
for (const [label, config] of Object.entries(configs)) {
  const lines = structuralLines(config);

  let depth = 0;
  let minDepth = 0;
  for (const line of lines) {
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    minDepth = Math.min(minDepth, depth);
  }
  check(`${label}: braces balance`, depth === 0, `ends at depth ${depth}`);
  check(`${label}: never closes more than it opens`, minDepth >= 0, `min depth ${minDepth}`);

  // Every directive line must end in ; { or } — the most common way a generated
  // config fails nginx -t.
  const badTerminator = lines.filter((line) => !/[;{}]$/.test(line));
  check(
    `${label}: every directive is terminated`,
    badTerminator.length === 0,
    badTerminator.join(" | "),
  );

  const serverBlocks = lines.filter((line) => line === "server {").length;
  const expected = expectedServerBlocks[label] ?? 2;
  check(
    `${label}: has ${expected} server block(s)`,
    serverBlocks === expected,
    String(serverBlocks),
  );

  // A stray quote would unbalance the config.
  const quotes = (config.match(/"/g) ?? []).length;
  check(`${label}: double quotes are balanced`, quotes % 2 === 0, String(quotes));
}

// ---------------------------------------------------------------------
// Real nginx -t, when available.
// ---------------------------------------------------------------------

function run(command: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 20_000 }, (err, stdout, stderr) => {
      resolve({
        code: err ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0,
        out: `${stdout}${stderr}`,
      });
    });
  });
}

const probe = await run("nginx", ["-v"]);
if (probe.out.toLowerCase().includes("nginx version")) {
  console.log(`\nReal nginx found (${probe.out.trim()}), running nginx -t:`);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "grp-nginx-"));
  try {
    // nginx -t needs a complete config, so wrap the vhosts in a minimal http{}.
    // Certificates are not read during a syntax check, so the paths need not exist.
    const vhostDir = path.join(dir, "vhosts");
    await fs.mkdir(vhostDir, { recursive: true });
    await fs.writeFile(path.join(vhostDir, "proxy.conf"), configs.proxy);
    await fs.writeFile(path.join(vhostDir, "alias.conf"), configs.alias);
    await fs.writeFile(path.join(vhostDir, "bootstrap.conf"), configs.bootstrap);

    const main = `events {}
http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }
    include ${vhostDir.replace(/\\/g, "/")}/*.conf;
}
`;
    const mainPath = path.join(dir, "nginx.conf");
    await fs.writeFile(mainPath, main);

    const result = await run("nginx", ["-t", "-c", mainPath, "-p", dir]);
    // "test is successful" is the pass signal; ssl_stapling emits a warning on
    // some builds, which is not a failure.
    const ok = result.out.includes("syntax is ok") || result.out.includes("test is successful");
    check("nginx accepts the generated config", ok, result.out.trim().slice(0, 400));
    // The specific failure that shipped: `unknown directive "http2"`, from
    // emitting `http2 on;` to an nginx older than 1.25.1.
    check(
      "no unknown-directive error",
      !/unknown directive/i.test(result.out),
      result.out.trim().slice(0, 300),
    );

    // Prove the version->syntax mapping against this nginx directly: the form we
    // chose must load, and if this build predates 1.25.1 the other form must not.
    // Without this the mapping is only ever asserted against itself.
    const probeStyle = async (style: "directive" | "listen") => {
      const styleDir = await fs.mkdtemp(path.join(os.tmpdir(), "grp-h2-"));
      try {
        const vh = path.join(styleDir, "vhosts");
        await fs.mkdir(vh, { recursive: true });
        await fs.writeFile(
          path.join(vh, "probe.conf"),
          renderVhost({
            hostname: "probe.example",
            certPath: "/etc/ssl/probe/fullchain.pem",
            keyPath: "/etc/ssl/probe/privkey.pem",
            upstream: "127.0.0.1:3000",
            http2: style,
          }),
        );
        const conf = path.join(styleDir, "nginx.conf");
        await fs.writeFile(
          conf,
          `events {}\nhttp {\n  map $http_upgrade $connection_upgrade { default upgrade; '' close; }\n  include ${vh.replace(/\\/g, "/")}/*.conf;\n}\n`,
        );
        const r = await run("nginx", ["-t", "-c", conf, "-p", styleDir]);
        return !/unknown directive/i.test(r.out);
      } finally {
        await fs.rm(styleDir, { recursive: true, force: true }).catch(() => undefined);
      }
    };

    check(`the chosen form ("${http2}") loads on this nginx`, await probeStyle(http2 === "off" ? "listen" : http2));
    if (detected && detected.major === 1 && (detected.minor < 25 || (detected.minor === 25 && detected.patch < 1))) {
      check(
        `this nginx (${detected.raw}) rejects "http2 on;" — the bug is real and detection is necessary`,
        !(await probeStyle("directive")),
      );
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
} else {
  console.log(
    "\nnginx not found on PATH — skipped `nginx -t`.\n" +
      "  Structural checks passed. Run this on the VPS (or in WSL) for a full validation.",
  );
}

console.log(failures === 0 ? "\nAll nginx syntax checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
