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

  // Super Admin
  SUPER_ADMIN_USER: z.string().optional().default("contactgreviewpilot@gmail.com"),
  SUPER_ADMIN_PASSWORD: z.string().optional().default("greviewpilot@2026"),
  SUPER_ADMIN_SECRET: z.string().optional().default("123"),

  // Google OAuth (optional in dev — feature-flagged in the config)
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  // Must match an Authorized redirect URI on the OAuth client *byte for
  // byte*, including scheme and trailing path. A mismatch is rejected by
  // Google before our code runs, so validate the shape here.
  GOOGLE_REDIRECT_URI: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^https?:\/\/.+/.test(v),
      "GOOGLE_REDIRECT_URI must be an absolute http(s) URL, e.g. https://app.example.com/api/google/callback",
    ),
  GOOGLE_BUSINESS_SCOPES: z
    .string()
    .optional()
    .default(
      "openid email profile https://www.googleapis.com/auth/business.manage",
    )
    .refine(
      (v) => v.includes("https://www.googleapis.com/auth/business.manage"),
      "GOOGLE_BUSINESS_SCOPES must include https://www.googleapis.com/auth/business.manage — " +
        "every Business Profile API call depends on it",
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

  // Google Business Profile API — conservative app-level quotas (QPM).
  // Keep well below Google's documented defaults (e.g. Account Mgmt ~300 QPM).
  GOOGLE_ACCOUNT_API_QPM: z.coerce.number().int().positive().default(60),
  GOOGLE_BUSINESS_API_QPM: z.coerce.number().int().positive().default(120),
  GOOGLE_REVIEW_API_QPM: z.coerce.number().int().positive().default(60),
  GOOGLE_PERFORMANCE_API_QPM: z.coerce.number().int().positive().default(30),
  GOOGLE_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().positive().default(4),
  GOOGLE_RETRY_LIMIT: z.coerce.number().int().min(0).max(10).default(5),
  GOOGLE_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(2000),
  GOOGLE_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(300_000),
  // How many sync jobs the worker claims per cron tick.
  GOOGLE_SYNC_WORKER_BATCH: z.coerce.number().int().positive().default(5),
  // Retention for Google observability tables, pruned on the auto-sync tick.
  // GoogleApiRequestLog gets a row per HTTP attempt and is only ever queried
  // for the last hour, so it needs a short window; SyncRun is the visible run
  // history, so it keeps longer.
  GOOGLE_REQUEST_LOG_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(14),
  GOOGLE_SYNC_RUN_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(90),
  // Sync lock TTL (seconds) — expired locks are stealable.
  GOOGLE_SYNC_LOCK_TTL_SEC: z.coerce.number().int().positive().default(300),

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
  // Also issue a certificate + nginx vhost for the www counterpart of APP_URL's
  // hostname, redirecting it to the primary. On by default: visitors type both
  // forms, and a domain that only serves one of them looks broken. Set to
  // "false" if APP_URL is already the www form, or if something else (a CDN)
  // owns the www hostname.
  PLATFORM_INCLUDE_WWW: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v !== "false"),
  // Extra hostnames, comma-separated, to include on the platform's own
  // certificate and nginx config — e.g. a legacy domain being retired. Rare;
  // most deployments need only APP_URL and its www counterpart.
  PLATFORM_ALT_HOSTNAMES: z
    .string()
    .optional()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
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

/**
 * Whether a redirect URI is one Google will accept.
 *
 * Google requires https for OAuth redirect URIs, with an explicit exemption
 * for loopback addresses so local development works.
 */
function isSecureRedirectUri(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol === "https:") return true;
    return (
      u.protocol === "http:" &&
      (u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname === "[::1]" ||
        u.hostname === "::1")
    );
  } catch {
    return false;
  }
}

const RefinedEnvSchema = EnvSchema.superRefine((cfg, ctx) => {
  // Google OAuth is all-or-nothing. A deploy with an ID but no secret used to
  // pass validation and then fail at the token exchange, which reads as a
  // Google outage rather than a missing variable.
  const hasId = Boolean(cfg.GOOGLE_CLIENT_ID);
  const hasSecret = Boolean(cfg.GOOGLE_CLIENT_SECRET);
  if (hasId !== hasSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasId ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID"],
      message:
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together — " +
        "set both to enable the Google Business connection, or neither to disable it",
    });
  }

  // In production the redirect URI must be explicit. The APP_URL fallback is
  // fine locally, but silently deriving it in production produces a value that
  // may not be registered on the OAuth client, and the only symptom is a
  // redirect_uri_mismatch on Google's own error page.
  if (cfg.NODE_ENV === "production" && hasId) {
    if (!cfg.GOOGLE_REDIRECT_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_REDIRECT_URI"],
        message:
          "GOOGLE_REDIRECT_URI must be set explicitly in production and must match the " +
          "Authorized redirect URI registered on the OAuth client verbatim",
      });
    } else if (!isSecureRedirectUri(cfg.GOOGLE_REDIRECT_URI)) {
      // Google accepts plain http only for loopback addresses. Note that
      // `next build` forces NODE_ENV=production, so a local production build
      // with a localhost redirect URI must not trip this.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_REDIRECT_URI"],
        message:
          "GOOGLE_REDIRECT_URI must use https:// — Google rejects plain http redirect " +
          "URIs for anything other than localhost/127.0.0.1",
      });
    }
  }

  // Encrypted-at-rest Google tokens become unreadable if the key changes, so
  // production must pin one rather than inherit the AUTH_SECRET-derived
  // fallback, which moves whenever AUTH_SECRET is rotated.
  if (cfg.NODE_ENV === "production" && hasId && !cfg.ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ENCRYPTION_KEY"],
      message:
        "ENCRYPTION_KEY must be set in production when Google OAuth is enabled — " +
        "without it the token encryption key is derived from AUTH_SECRET, and rotating " +
        "AUTH_SECRET would make every stored Google token permanently unreadable",
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  // RefinedEnvSchema adds the cross-field checks. `Env` stays derived from the
  // base object schema so `EnvSchema.shape` remains usable elsewhere.
  const parsed = RefinedEnvSchema.safeParse(process.env);
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
