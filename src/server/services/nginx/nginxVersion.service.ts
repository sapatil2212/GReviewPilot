/**
 * nginx version detection, used to emit HTTP/2 syntax the installed nginx accepts.
 *
 * HTTP/2 is configured two mutually incompatible ways depending on version:
 *
 *   nginx <  1.25.1   listen 443 ssl http2;     the standalone directive does not exist
 *   nginx >= 1.25.1   http2 on;                 the listen parameter is deprecated
 *
 * The standalone `http2 on;` directive appeared in 1.25.1
 * (http://nginx.org/en/docs/http/ngx_http_v2_module.html). Emitting it on anything
 * older is a hard failure — `unknown directive "http2"` — which fails `nginx -t`,
 * so the reload is refused and the generated HTTPS server block never loads. The
 * domain then keeps serving over the HTTP-only bootstrap vhost with a certificate
 * sitting unused on disk, which is exactly the state this module exists to prevent.
 *
 * Going the other way is merely noisy: on 1.25.1+ the `listen ... http2` parameter
 * is deprecated and warns, but still works. That asymmetry decides the fallback —
 * when the version cannot be determined, the listen parameter is chosen, because a
 * warning is recoverable and an unknown directive is not.
 */

import { execFile } from "node:child_process";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

/** How the generated HTTPS block should enable HTTP/2. */
export type Http2Style =
  /** `http2 on;` as its own directive. nginx >= 1.25.1 only. */
  | "directive"
  /** `listen 443 ssl http2;`. Valid from 1.9.5, deprecated (warning) from 1.25.1. */
  | "listen"
  /** Omit HTTP/2 entirely. Always valid; HTTP/1.1 only. */
  | "off";

export interface NginxVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
}

/** Parse `nginx version: nginx/1.24.0 (Ubuntu)`. */
export function parseNginxVersion(output: string): NginxVersion | null {
  const match = /nginx\/(\d+)\.(\d+)\.(\d+)/.exec(output);
  if (!match) return null;
  return {
    raw: match[0],
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** True when this build has the standalone `http2` directive (1.25.1+). */
export function supportsHttp2Directive(version: NginxVersion): boolean {
  const { major, minor, patch } = version;
  if (major > 1) return true;
  if (major < 1) return false;
  if (minor > 25) return true;
  if (minor < 25) return false;
  return patch >= 1;
}

export function http2StyleFor(version: NginxVersion): Http2Style {
  return supportsHttp2Directive(version) ? "directive" : "listen";
}

/**
 * Run `nginx -v`, which writes to stderr and needs no privileges.
 *
 * Deliberately not `nginx -T`: that reads every included file and effectively
 * requires root, while the version banner is available to any user that can
 * execute the binary. Version detection must work in the same contexts that
 * generate a vhost.
 */
export async function detectNginxVersion(): Promise<NginxVersion | null> {
  return new Promise((resolve) => {
    execFile("nginx", ["-v"], { timeout: 10_000 }, (err, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      const parsed = parseNginxVersion(output);
      if (!parsed && err) {
        logger.debug("Could not detect the nginx version", { err: String(err) });
      }
      resolve(parsed);
    });
  });
}

/**
 * Cached because it is consulted on every vhost render — including once per
 * domain during a monitor sweep — and the answer cannot change without the
 * process being restarted alongside the package upgrade.
 */
let cached: Promise<Http2Style> | null = null;

/** Discard the cached style. For tests and for the CLI after an upgrade. */
export function resetHttp2StyleCache(): void {
  cached = null;
}

/**
 * The HTTP/2 style to generate.
 *
 * `NGINX_HTTP2` overrides detection entirely, for operators behind a proxy that
 * reports an unexpected banner or who want HTTP/2 off. Otherwise the installed
 * version decides.
 */
export async function resolveHttp2Style(): Promise<Http2Style> {
  if (env.NGINX_HTTP2 !== "auto") return env.NGINX_HTTP2;
  if (cached) return cached;

  cached = detectNginxVersion().then((version) => {
    if (!version) {
      // Unknown version: choose the form that is valid on every nginx that has
      // ever supported HTTP/2. Being wrong here costs a deprecation warning
      // rather than a config nginx refuses to load.
      logger.warn(
        "nginx version unknown; generating the compatible `listen ... http2` form. " +
          "Set NGINX_HTTP2=directive if this nginx is 1.25.1 or newer.",
      );
      return "listen" as Http2Style;
    }
    const style = http2StyleFor(version);
    logger.info("Detected nginx", { version: version.raw, http2: style });
    return style;
  });

  return cached;
}
