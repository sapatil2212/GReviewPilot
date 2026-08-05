/**
 * nginx vhost lifecycle.
 *
 * Writes one server block per custom domain, then validates and reloads nginx
 * through a single narrowly-scoped command. The app user does not get write
 * access to /etc/nginx or the ability to run arbitrary sudo — it may run exactly
 * one root-owned script that runs `nginx -t` and reloads only if that passes.
 * See docs/CUSTOM-DOMAINS-VPS.md for the script and sudoers entry.
 *
 * The validate-then-reload ordering matters more than it looks: a bad config
 * takes down every tenant site on the box simultaneously, so a reload is never
 * attempted on a config nginx has not already accepted, and a failed validation
 * rolls the file back.
 */

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import { renderVhost, vhostFilename, assertSafeHostname } from "./vhostTemplate";

export class NginxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NginxError";
  }
}

/**
 * Where nginx sends tenant traffic.
 *
 * Read from configuration rather than derived from APP_URL. An earlier version
 * inferred it from APP_URL, which works in development (where the public URL and
 * the listen address are the same) and breaks in production: `https://app.example.com`
 * has no explicit port, so it resolved to 443 and every generated vhost proxied
 * plain HTTP into nginx's own TLS listener.
 */
function upstream(): string {
  return env.APP_UPSTREAM;
}

/**
 * Run the reload command with a timeout.
 *
 * `execFile` with an argument array rather than `exec` with a string: the
 * command is operator-configured, but shell interpolation here would turn any
 * future dynamic argument into a command-injection vector.
 */
function runReload(): Promise<{ stdout: string; stderr: string }> {
  const parts = env.NGINX_RELOAD_COMMAND.trim().split(/\s+/);
  const [command, ...args] = parts;
  if (!command) throw new NginxError("NGINX_RELOAD_COMMAND is empty");

  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(
          new NginxError(
            `nginx reload failed (${env.NGINX_RELOAD_COMMAND}): ${stderr.trim() || err.message}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export const nginxManager = {
  enabled(): boolean {
    return env.SSL_PROVISIONING === "nginx";
  },

  /**
   * Path of a domain's server block.
   *
   * posix separators for the same reason as the certificate paths: this is an
   * nginx directory on a Linux host, and `path.join` would emit backslashes when
   * the provisioning CLI is run from a Windows machine.
   */
  vhostPath(hostname: string): string {
    assertSafeHostname(hostname);
    return path.posix.join(env.NGINX_VHOST_PATH, vhostFilename(hostname));
  },

  /**
   * Install (or replace) the server block for a domain and reload nginx.
   *
   * Restores the previous file if nginx rejects the new one, so a bad write
   * cannot leave the box in a state where nginx refuses to start.
   */
  async install(options: {
    hostname: string;
    certPath: string;
    keyPath: string;
    redirectTo?: string | null;
  }): Promise<void> {
    if (!this.enabled()) {
      throw new NginxError("SSL_PROVISIONING is not set to nginx");
    }

    const target = this.vhostPath(options.hostname);
    const config = renderVhost({
      hostname: options.hostname,
      certPath: options.certPath,
      keyPath: options.keyPath,
      upstream: upstream(),
      redirectTo: options.redirectTo ?? null,
    });

    const previous = await fs.readFile(target, "utf8").catch(() => null);
    if (previous === config) {
      logger.debug("nginx vhost unchanged", { hostname: options.hostname });
      return;
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, config, { mode: 0o644 });

    try {
      await runReload();
      logger.info("nginx vhost installed", { hostname: options.hostname, target });
    } catch (err) {
      // Put the old config back before surfacing the error, so the next reload
      // (by us or by an operator) starts from a state nginx accepts.
      if (previous === null) {
        await fs.rm(target, { force: true }).catch(() => undefined);
      } else {
        await fs.writeFile(target, previous, { mode: 0o644 }).catch(() => undefined);
      }
      logger.error("nginx rejected the new vhost; rolled back", {
        hostname: options.hostname,
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  /** Remove a domain's server block and reload. Safe when the file is absent. */
  async remove(hostname: string): Promise<void> {
    if (!this.enabled()) return;

    const target = this.vhostPath(hostname);
    const existed = await fs
      .access(target)
      .then(() => true)
      .catch(() => false);
    if (!existed) return;

    await fs.rm(target, { force: true });
    try {
      await runReload();
      logger.info("nginx vhost removed", { hostname });
    } catch (err) {
      // Deliberately not restored: leaving a vhost pointing at a certificate
      // that is about to be deleted is worse than a stale reload, and nginx
      // keeps serving the old config until it next reloads successfully.
      logger.error("nginx reload after vhost removal failed", {
        hostname,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /** Preview the generated config without touching the filesystem. */
  preview(options: {
    hostname: string;
    certPath: string;
    keyPath: string;
    redirectTo?: string | null;
  }): string {
    return renderVhost({
      hostname: options.hostname,
      certPath: options.certPath,
      keyPath: options.keyPath,
      upstream: upstream(),
      redirectTo: options.redirectTo ?? null,
    });
  },
};
