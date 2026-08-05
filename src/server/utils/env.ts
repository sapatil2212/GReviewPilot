/**
 * Environment variable validation.
 *
 * Imported once at server boot (via next.config.ts side-effect or the
 * first call site inside the server tree). Fails fast if any required
 * variable is missing or malformed so we never deploy a half-configured
 * process.
 */

import { z } from "zod";

const EnvSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Auth.js
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  AUTH_URL: z.string().url(),
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Google OAuth (optional in dev — feature-flagged in the config)
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),
  GOOGLE_BUSINESS_SCOPES: z
    .string()
    .optional()
    .default(
      "openid email profile https://www.googleapis.com/auth/business.manage",
    ),

  // Symmetric key for encrypting Google OAuth tokens etc. Optional —
  // when unset we derive a key from AUTH_SECRET via HKDF.
  ENCRYPTION_KEY: z.string().optional().default(""),

  // AI — Gemini for review generation, insights, content, etc.
  GEMINI_API_KEY: z.string().optional().default(""),
  // Use a floating alias: pinned versions (gemini-2.0-flash,
  // gemini-2.5-flash) get retired and start returning 404, which silently
  // degrades every AI feature to its template fallback.
  GEMINI_MODEL: z.string().optional().default("gemini-flash-latest"),

  // Google Places API (optional) — used to resolve/verify Place IDs
  // in the Quick Connect flow. When absent we still accept raw Place
  // IDs and extract them from Maps URLs client-side.
  GOOGLE_MAPS_API_KEY: z.string().optional().default(""),

  // Scheduled jobs. Set this to enable the /api/cron/* endpoints; the
  // caller must present it as `Authorization: Bearer <secret>`.
  // Leave empty to keep auto-sync disabled.
  CRON_SECRET: z.string().optional().default(""),
  // How stale a Google connection must be before auto-sync re-runs it.
  AUTO_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(720),

  // Email (SMTP)
  EMAIL_HOST: z.string().min(1),
  EMAIL_PORT: z.coerce.number().int().positive(),
  EMAIL_USERNAME: z.string().min(1),
  EMAIL_PASSWORD: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  EMAIL_BCC: z.string().optional().default(""),

  // Website builder — platform subdomain
  // A bare hostname (no protocol) tenants' sites are hosted under by
  // default, e.g. "sites.greviewpilot.com" -> <slug>.sites.greviewpilot.com.
  // Optional: when unset, sites are only reachable at APP_URL/s/<slug>.
  SITES_ROOT_DOMAIN: z.string().optional().default(""),
  // A-record IP for apex custom domains. Defaults to Vercel's shared apex IP.
  // On a self-hosted VPS this is the server's public IP.
  SITE_APEX_IP: z.string().optional().default("76.76.21.21"),
  // CNAME target tenants point subdomains at. Must be a bare hostname with no
  // port or scheme. Defaults to APP_URL's hostname, which is correct only while
  // that name resolves to the server tenant traffic must reach — set it
  // explicitly so tenant DNS survives the dashboard moving.
  SITE_CNAME_TARGET: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v),
      "SITE_CNAME_TARGET must be a bare hostname — no scheme, port, or trailing dot",
    ),
  // CA that issues certificates for custom domains, as it appears in a CAA
  // record. Used to warn a tenant when their CAA records would block issuance.
  // Vercel and most self-hosted setups use Let's Encrypt; Cloudflare-terminated
  // setups should change this to "pki.goog" or "digicert.com" as appropriate.
  SSL_CA_ISSUER_DOMAIN: z.string().optional().default("letsencrypt.org"),

  // ---------- Certificate provisioning (self-hosted nginx) ----------
  // "off"   — something else terminates TLS (Vercel, Cloudflare, Caddy). The
  //           app only observes certificates; it never tries to issue them.
  // "nginx" — this app issues certificates via ACME and writes an nginx vhost
  //           per custom domain.
  // Defaults to "off" so a dev machine or a managed host never attempts to
  // touch /etc/nginx or hit a certificate authority.
  SSL_PROVISIONING: z.enum(["off", "nginx"]).default("off"),
  // Staging by default. Let's Encrypt production has strict, per-domain rate
  // limits that are easy to burn through while a deployment is being wired up,
  // and a locked-out domain cannot get a certificate for a week. Staging issues
  // untrusted certificates, which is the correct trade for a first run.
  ACME_DIRECTORY: z.enum(["staging", "production"]).default("staging"),
  // Contact address registered with the CA; receives expiry warnings.
  ACME_CONTACT_EMAIL: z.string().optional().default(""),
  // ACME account key. Persisted so we reuse one registration instead of
  // creating a new account on every deploy, which would eventually be
  // rate-limited. Created on first use if absent.
  ACME_ACCOUNT_KEY_PATH: z
    .string()
    .optional()
    .default("/var/www/storage/greviewpilot/acme/account.key"),
  // Where issued certificates are written, one directory per hostname.
  SSL_CERT_PATH: z.string().optional().default("/var/www/storage/greviewpilot/certs"),
  // Directory nginx includes server blocks from.
  NGINX_VHOST_PATH: z.string().optional().default("/etc/nginx/sites-enabled"),
  // Command that validates and reloads nginx. Must be runnable by the app user
  // without a password — see docs/CUSTOM-DOMAINS-VPS.md for the sudoers entry.
  NGINX_RELOAD_COMMAND: z
    .string()
    .optional()
    .default("sudo /usr/local/bin/greviewpilot-nginx-reload"),
  // Address nginx proxies tenant traffic to: where this app actually listens.
  //
  // Must be configured separately from APP_URL. They are the same thing in
  // development and different in production — APP_URL is the public HTTPS
  // address, which behind nginx is nginx itself. Deriving the upstream from it
  // produced `proxy_pass http://127.0.0.1:443`, pointing every tenant site back
  // into nginx's own TLS port.
  APP_UPSTREAM: z
    .string()
    .optional()
    .default("127.0.0.1:3000")
    .refine((v) => /^[a-z0-9.-]+:\d+$/i.test(v), "APP_UPSTREAM must be host:port")
    .refine(
      (v) => !["80", "443"].includes(v.split(":")[1] ?? ""),
      "APP_UPSTREAM must not be port 80 or 443 — those are nginx's own ports, and " +
        "pointing tenant vhosts at them creates a proxy loop. Use the port the Node " +
        "process listens on, e.g. 127.0.0.1:3000.",
    ),

  // Storage / Media
  STORAGE_PROVIDER: z.enum(["local", "s3", "cloudinary"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().optional().default(".uploads"),
  // Dedicated root for website-builder uploads (MediaCategory.WEBSITE_MEDIA).
  // Absolute paths (e.g. a VPS mount like /var/www/storage/greviewpilot/website)
  // are used as-is; relative paths resolve against STORAGE_LOCAL_PATH's root
  // (process.cwd()), same as every other local-disk key.
  WEBSITE_MEDIA_PATH: z.string().optional().default("website"),
  MEDIA_MAX_IMAGE_MB: z.coerce.number().int().positive().default(25),
  MEDIA_MAX_VIDEO_MB: z.coerce.number().int().positive().default(200),
  MEDIA_MAX_AUDIO_MB: z.coerce.number().int().positive().default(50),
  MEDIA_MAX_DOCUMENT_MB: z.coerce.number().int().positive().default(20),
  MEDIA_MAX_TENANT_GB: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Group errors by field for a readable message.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(
      `\n\u274c Invalid environment configuration:\n${issues}\n\nSee .env.example for the required shape.\n`,
    );
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}

/**
 * Fully validated, typed environment. Access as `env.DATABASE_URL`, etc.
 * Do NOT read `process.env.*` elsewhere in the server tree.
 */
export const env: Env = parseEnv();

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/** Google OAuth is only wired up when both credentials are present. */
export const googleAuthEnabled = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

/**
 * Full URL Google should redirect to after the consent screen for the
 * Business Profile connection flow. Falls back to a sensible default
 * built from APP_URL when the env var is not set — but production
 * deployments must set this explicitly so it matches the value in the
 * Google Cloud console.
 */
export const googleRedirectUri: string =
  env.GOOGLE_REDIRECT_URI || `${env.APP_URL}/api/google/callback`;

/** AI features (review generation, insights) are enabled when a Gemini key is present. */
export const geminiEnabled = Boolean(env.GEMINI_API_KEY);

/** Places API lookups are enabled when a Maps key is present. */
export const placesApiEnabled = Boolean(env.GOOGLE_MAPS_API_KEY);

/** Scheduled jobs are only callable when a cron secret is configured. */
export const cronEnabled = Boolean(env.CRON_SECRET);

/** Platform subdomains (<slug>.SITES_ROOT_DOMAIN) are only offered when configured. */
export const sitesSubdomainEnabled = Boolean(env.SITES_ROOT_DOMAIN);
