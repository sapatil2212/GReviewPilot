/**
 * nginx server-block generation for custom domains.
 *
 * Kept as a pure string function with no filesystem or process access so the
 * output can be asserted in tests. A malformed vhost fails `nginx -t` and, if it
 * ever reached a reload, would take every tenant site on the box down at once —
 * so this is the part most worth testing directly.
 */

export interface VhostOptions {
  hostname: string;
  /** Full-chain PEM path for `ssl_certificate`. */
  certPath: string;
  /** Private key path for `ssl_certificate_key`. */
  keyPath: string;
  /** Where the Next.js app listens, e.g. "127.0.0.1:3000". */
  upstream: string;
  /**
   * Redirect this hostname to another (used for `www` -> apex aliases).
   * Applied at the edge so the redirect costs no application request.
   */
  redirectTo?: string | null;
}

/** Prefix on every generated file, so unrelated vhosts are never touched. */
export const VHOST_PREFIX = "greviewpilot-";

/** Filename for a hostname's server block. */
export function vhostFilename(hostname: string): string {
  return `${VHOST_PREFIX}${hostname.toLowerCase()}.conf`;
}

/**
 * Reject anything that could break out of a config value.
 *
 * Hostnames arrive from tenant input and are interpolated into a file nginx
 * executes as configuration. A hostname containing `;` or a newline could inject
 * arbitrary directives, so this is a hard refusal rather than an escape.
 */
export function assertSafeHostname(hostname: string): void {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hostname)) {
    throw new Error(`Unsafe hostname for nginx config: ${JSON.stringify(hostname)}`);
  }
  if (hostname.length > 253) {
    throw new Error(`Hostname exceeds the maximum DNS length: ${hostname}`);
  }
}

function assertSafePath(label: string, value: string): void {
  // Same reasoning as hostnames: these end up as bare config values.
  if (/[;\r\n{}"'$\\]/.test(value)) {
    throw new Error(`Unsafe ${label} for nginx config: ${JSON.stringify(value)}`);
  }
}

/**
 * Build the server block for one custom domain.
 *
 * Port 80 is not blanket-redirected to HTTPS: `/.well-known/acme-challenge/`
 * must keep working over plain HTTP forever, because that is how renewals are
 * validated. A redirect there would break every renewal after the first
 * certificate, which is the kind of failure that only shows up 60 days later.
 */
export function renderVhost(options: VhostOptions): string {
  assertSafeHostname(options.hostname);
  assertSafePath("certificate path", options.certPath);
  assertSafePath("key path", options.keyPath);
  assertSafePath("upstream", options.upstream);
  if (options.redirectTo) assertSafeHostname(options.redirectTo);

  const host = options.hostname.toLowerCase();
  const target = options.redirectTo?.toLowerCase();

  const proxyBody = target
    ? `    # Alias domain: redirect at the edge rather than proxying, so the
    # canonical host is reached in one hop and the app never sees the alias.
    return 308 https://${target}$request_uri;`
    : `    location / {
        proxy_pass http://${options.upstream};
        proxy_http_version 1.1;

        # Host must be preserved: middleware.ts routes the request to the right
        # tenant site by inspecting it. Rewriting it here would serve the
        # dashboard instead of the customer's website.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # Server-sent events and streamed responses must not be buffered.
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_buffering off;

        proxy_connect_timeout 10s;
        proxy_read_timeout    120s;
    }`;

  return `# Managed by GReviewPilot — do not edit.
# Generated for ${host}. Changes are overwritten when the domain is
# re-provisioned or its certificate renews.

server {
    listen 80;
    listen [::]:80;
    server_name ${host};

    # Must stay on plain HTTP and must never redirect: renewals revalidate here
    # every 60 days.
    location ^~ /.well-known/acme-challenge/ {
        proxy_pass http://${options.upstream};
        proxy_set_header Host $host;
        access_log off;
    }

    location / {
        return 308 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${host};

    ssl_certificate     ${options.certPath};
    ssl_certificate_key ${options.keyPath};

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP stapling shortens the TLS handshake for visitors.
    ssl_stapling        on;
    ssl_stapling_verify on;

    # 6 months rather than the usual year: this is a customer-owned domain, and
    # a mistaken long-lived HSTS pin on someone else's domain is not ours to
    # make. No preload or includeSubDomains for the same reason.
    add_header Strict-Transport-Security "max-age=15768000" always;

    client_max_body_size 25m;

${proxyBody}
}
`;
}
