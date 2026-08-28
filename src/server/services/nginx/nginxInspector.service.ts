/**
 * Reads nginx's *effective* configuration and answers one question: which
 * server block will actually serve a given hostname?
 *
 * Grepping `/etc/nginx` cannot answer that, and confidently gives the wrong
 * answer. A file in `sites-available` that was never symlinked into
 * `sites-enabled` matches every grep and is loaded by nothing; an `include` line
 * pasted into such a file looks present and does nothing. That false positive is
 * expensive here, because the symptom it hides — a generated vhost that exists on
 * disk, passes `nginx -t`, survives a reload, and is still never matched — looks
 * exactly like a bug in the application.
 *
 * `nginx -T` dumps the config as nginx itself assembled it, following every
 * include. Everything below parses that, so a claim about what nginx does is
 * based on what nginx says it does.
 *
 * The parser is pragmatic rather than complete: it understands `server`,
 * `listen`, `server_name`, `location`, `proxy_pass` and `ssl_certificate`, which
 * is all that virtual-host selection depends on. It is a diagnostic, so a
 * construct it cannot read is reported as unknown rather than guessed at.
 */

import { execFile } from "node:child_process";
import { env } from "@/server/utils/env";

export interface ListenDirective {
  raw: string;
  /** Explicit bind address, or null for the wildcard (`listen 80`). */
  address: string | null;
  port: string;
  defaultServer: boolean;
  ssl: boolean;
}

export interface ServerBlock {
  /** Config file the block was read from, per nginx's own dump. */
  file: string;
  listens: ListenDirective[];
  serverNames: string[];
  /** True when the block forwards /.well-known/acme-challenge/ somewhere. */
  servesAcmeChallenge: boolean;
  /** True when the block forwards the whole /.well-known/ prefix. */
  servesWellKnown: boolean;
  proxyPasses: string[];
  certificatePath: string | null;
}

export interface EffectiveConfig {
  blocks: ServerBlock[];
  /** Raw `nginx -T` output, kept so callers can search it directly. */
  raw: string;
}

export class NginxInspectionError extends Error {}

/**
 * Dump the effective config.
 *
 * `nginx -T` needs read access to every included file, which in practice means
 * root. Rather than widening the sudo grant (the reload helper is deliberately a
 * single fixed command with no arguments), this tries the direct invocation and
 * reports honestly when it is not permitted — the CLI that uses it is run by an
 * operator who already has a root shell.
 */
export async function dumpEffectiveConfig(): Promise<EffectiveConfig> {
  const raw = await new Promise<string>((resolve, reject) => {
    execFile("nginx", ["-T"], { timeout: 20_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      // nginx -T writes the test result to stderr and the config to stdout, and
      // exits non-zero only when the config is invalid.
      if (err && !stdout) {
        reject(new NginxInspectionError(`nginx -T failed: ${(stderr || err.message).trim()}`));
        return;
      }
      resolve(stdout);
    });
  });

  return { blocks: parseServerBlocks(raw), raw };
}

/** Strip a trailing comment without touching quoted strings (none matter here). */
function stripComment(line: string): string {
  const index = line.indexOf("#");
  return (index >= 0 ? line.slice(0, index) : line).trim();
}

function parseListen(value: string): ListenDirective {
  const tokens = value.split(/\s+/).filter(Boolean);
  const target = tokens[0] ?? "";
  const defaultServer = tokens.includes("default_server");
  const ssl = tokens.includes("ssl");

  let address: string | null = null;
  let port = "";

  if (/^\[.*\]:\d+$/.test(target)) {
    // [::]:80
    address = target.slice(0, target.lastIndexOf(":"));
    port = target.slice(target.lastIndexOf(":") + 1);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(target)) {
    [address, port] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
  } else if (/^\d+$/.test(target)) {
    port = target;
  } else if (target.includes(":")) {
    address = target.slice(0, target.lastIndexOf(":"));
    port = target.slice(target.lastIndexOf(":") + 1);
  } else {
    // `listen unix:/...` and similar; not relevant to hostname selection.
    address = target;
  }

  return { raw: value.trim(), address, port, defaultServer, ssl };
}

/**
 * Walk the dump and collect every `server { }` block with the file it came from.
 *
 * Brace counting rather than a real grammar: nginx config is simple enough that
 * depth tracking is reliable for locating blocks, and the alternative is a
 * dependency for a diagnostic.
 */
export function parseServerBlocks(dump: string): ServerBlock[] {
  const blocks: ServerBlock[] = [];
  let file = "(unknown)";
  let depth = 0;

  let current: ServerBlock | null = null;
  let currentStartDepth = 0;
  let locationPrefix: string | null = null;
  let locationDepth = 0;

  for (const rawLine of dump.split("\n")) {
    const fileMarker = /^#\s*configuration file\s+(.+?):\s*$/.exec(rawLine.trim());
    if (fileMarker) {
      file = fileMarker[1];
      continue;
    }

    const line = stripComment(rawLine);
    if (!line) continue;

    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    // A `server {` at any depth starts a block we care about.
    if (current === null && /^server\s*\{/.test(line)) {
      current = {
        file,
        listens: [],
        serverNames: [],
        servesAcmeChallenge: false,
        servesWellKnown: false,
        proxyPasses: [],
        certificatePath: null,
      };
      currentStartDepth = depth;
      depth += opens - closes;
      continue;
    }

    if (current !== null) {
      const locationMatch = /^location\s+(.+?)\s*\{/.exec(line);
      if (locationMatch) {
        locationPrefix = locationMatch[1].trim();
        locationDepth = depth;
        if (/\/\.well-known\/acme-challenge\//.test(locationPrefix)) {
          current.servesAcmeChallenge = true;
        } else if (/\/\.well-known\/?$/.test(locationPrefix.replace(/^\^~\s*/, ""))) {
          // `location ^~ /.well-known/` covers acme-challenge and the routing probe.
          current.servesWellKnown = true;
          current.servesAcmeChallenge = true;
        }
      }

      const listenMatch = /^listen\s+([^;]+);/.exec(line);
      if (listenMatch) current.listens.push(parseListen(listenMatch[1]));

      const namesMatch = /^server_name\s+([^;]+);/.exec(line);
      if (namesMatch) {
        current.serverNames.push(
          ...namesMatch[1].split(/\s+/).filter(Boolean).map((n) => n.toLowerCase()),
        );
      }

      const proxyMatch = /^proxy_pass\s+([^;]+);/.exec(line);
      if (proxyMatch) current.proxyPasses.push(proxyMatch[1].trim());

      const certMatch = /^ssl_certificate\s+([^;]+);/.exec(line);
      if (certMatch) current.certificatePath = certMatch[1].trim();

      depth += opens - closes;

      if (locationPrefix !== null && depth <= locationDepth) locationPrefix = null;

      if (depth <= currentStartDepth) {
        blocks.push(current);
        current = null;
      }
      continue;
    }

    depth += opens - closes;
  }

  if (current !== null) blocks.push(current);
  return blocks;
}

// =====================================================================
// Selection
// =====================================================================

/** RFC 6125-ish wildcard match, as nginx applies it to server_name. */
export function nameMatches(pattern: string, hostname: string): boolean {
  if (pattern === hostname) return true;
  if (pattern === "_" || pattern === "") return false; // catch-all, not a match
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) && !hostname.slice(0, -suffix.length).includes(".");
  }
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    return hostname.startsWith(prefix);
  }
  return false;
}

export interface SelectionResult {
  /** Blocks declaring this exact hostname, in config order. */
  exact: ServerBlock[];
  /** Blocks matching via a wildcard server_name. */
  wildcard: ServerBlock[];
  /** The `default_server` for this port, which serves anything unmatched. */
  defaults: ServerBlock[];
  /**
   * Explicit bind addresses seen on this port.
   *
   * nginx selects the listening socket before it looks at `server_name`: a
   * request to `1.2.3.4:80` is served by the `listen 1.2.3.4:80` group if one
   * exists, and a block that only says `listen 80` is not in that group. So a
   * vhost can declare exactly the right hostname and still never be consulted.
   * A mix of specific and wildcard binds on one port is the hazard.
   */
  explicitAddresses: string[];
  /** True when more than one block claims the hostname — nginx ignores all but the first. */
  conflicting: boolean;
}

export function selectFor(
  blocks: ServerBlock[],
  hostname: string,
  port: string,
): SelectionResult {
  const host = hostname.toLowerCase();
  const onPort = blocks.filter((b) => b.listens.some((l) => l.port === port));

  const exact = onPort.filter((b) => b.serverNames.includes(host));
  const wildcard = onPort.filter(
    (b) => !b.serverNames.includes(host) && b.serverNames.some((n) => nameMatches(n, host)),
  );
  const defaults = onPort.filter((b) =>
    b.listens.some((l) => l.port === port && l.defaultServer),
  );

  const explicitAddresses = Array.from(
    new Set(
      onPort
        .flatMap((b) => b.listens.filter((l) => l.port === port))
        .map((l) => l.address)
        .filter((a): a is string => a !== null && a !== "[::]"),
    ),
  );

  return { exact, wildcard, defaults, explicitAddresses, conflicting: exact.length > 1 };
}

/** True when nginx's effective config loads the app's vhost directory. */
export function includesVhostDirectory(config: EffectiveConfig): boolean {
  return config.blocks.some((b) => b.file.startsWith(env.NGINX_VHOST_PATH));
}
