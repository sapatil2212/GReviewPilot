/**
 * Edge middleware — custom-domain routing + cheap authentication gate.
 *
 * Two jobs, in order:
 *
 *   1. Custom domains. A request arriving on a tenant's own hostname is
 *      rewritten onto the internal `/s/...` renderer so there is exactly one
 *      rendering path regardless of how a visitor arrived.
 *
 *   2. Auth gate. Only checks that a valid Auth.js JWT cookie is present and
 *      shaped correctly. Full DB validation (session active, user/tenant
 *      status, RBAC) happens in the Node runtime via `requireSession()`.
 *
 * Why not use Auth.js's `auth()` middleware helper? It would drag the full
 * config (Prisma adapter, argon2, nodemailer) into the Edge bundle, which is
 * not supported. For the same reason this file reads `process.env` directly
 * rather than importing the validated `env` object.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/dashboard-v2",
  "/settings",
  "/admin",
  "/super-admin",
  // The website builder needs the full viewport, so it sits outside
  // /dashboard. It still requires an authenticated session.
  "/builder",
  // Template previews render bare (no dashboard chrome) so the gallery can
  // iframe them, which likewise puts them outside /dashboard.
  "/template-preview",
  "/api/private",
  "/api/super-admin",
];

const AUTH_PAGE = "/auth";
const SUPER_ADMIN_LOGIN = "/super-admin/login";
const PUBLIC_EXCEPTIONS = [
  "/super-admin/login",
];

/**
 * Marks an internal rewrite target as host-addressed rather than slug-addressed.
 *
 * Encoding the hostname in the path (rather than passing it in a header) keeps
 * the rendered page cacheable per host: the cache key is the URL, so two
 * domains pointing at the same site still get separate, correct entries. Using
 * a header would force `headers()` into the render and opt the route out of
 * static caching entirely.
 *
 * Never user-visible — it only exists between middleware and the renderer.
 */
export const DOMAIN_SLUG_PREFIX = "_d~";

/**
 * Hostnames that belong to the platform itself and must never be treated as a
 * tenant domain.
 *
 * Derived from APP_URL so a self-hosted deployment works without extra config.
 * Preview and local hosts are excluded too, otherwise `npm run dev` would try
 * to resolve `localhost` as somebody's custom domain and 404 the dashboard.
 */
function isPlatformHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    // Bare IPs are never valid custom domains (addDomainSchema rejects them).
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    // Vercel preview and branch deployments.
    hostname.endsWith(".vercel.app")
  ) {
    return true;
  }

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      const platform = new URL(appUrl).hostname.toLowerCase();
      if (hostname === platform) return true;
      // Subdomains of the platform host are reserved for the platform. This
      // also covers the www counterpart nginx provisions for the platform's own
      // domain (see sslProvisioning.service.ts platformHostnames()) — nginx
      // redirects that hostname to the primary at the edge, but if a request
      // ever reached this app on it directly, it must render the dashboard, not
      // 404 as an unclaimed tenant domain.
      if (hostname.endsWith(`.${platform}`)) return true;
    } catch {
      // A malformed APP_URL must not break routing; fall through.
    }
  }
  return false;
}



function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hostname = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // ---------------------------------------------------------------
  // 1. Platform subdomain (<slug>.SITES_ROOT_DOMAIN) or custom domain
  // ---------------------------------------------------------------
  if (hostname && !isPlatformHost(hostname)) {
    // Platform endpoints must keep working on any tenant host: the rendered
    // page posts form submissions and analytics to absolute /api/site/... paths
    // on whatever host the visitor is on.
    //
    // `/.well-known/` must pass through for a separate and more important
    // reason: ACME HTTP-01 validation fetches
    // http://<domain>/.well-known/acme-challenge/<token>, and rewriting that
    // into the site renderer returns the tenant's 404 page instead of the
    // challenge response — which makes certificate issuance fail for every
    // custom domain when this app is the origin behind the TLS terminator.
    // It also covers the other well-known URIs (security.txt, apple-app-site-
    // association) that must never be shadowed by page routing.
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/.well-known/")
    ) {
      return NextResponse.next();
    }

    // Both the free platform subdomain and a tenant-owned custom domain are
    // encoded into the path the same way (host-addressed, via
    // DOMAIN_SLUG_PREFIX) rather than resolved to a slug here. Middleware runs
    // on the Edge runtime with no DB access, so it cannot know which hostnames
    // are subdomains of SITES_ROOT_DOMAIN vs. a real custom domain, or whether
    // either is actually connected — `resolvePublicPage()` in the Node
    // renderer decides that, and treats a `<slug>.SITES_ROOT_DOMAIN` hostname
    // as pre-verified (the platform owns that DNS) while a genuine custom
    // domain still requires a CONNECTED SiteDomain row.
    const url = req.nextUrl.clone();
    url.pathname = `/s/${DOMAIN_SLUG_PREFIX}${hostname}${pathname === "/" ? "" : pathname}`;
    // A rewrite, not a redirect: the visitor's URL bar must keep showing
    // whatever host they used. Canonical-host redirects (e.g. www -> apex)
    // are decided later, in the renderer, where the primary domain is known.
    return NextResponse.rewrite(url);
  }

  // ---------------------------------------------------------------
  // 2. Auth gate
  // ---------------------------------------------------------------
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    // Support both dev and prod cookie names.
    cookieName:
      process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
    // Auth.js v5 encrypts by default.
    salt:
      process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
  });

  // Shape check — must have our custom claims.
  const isValid =
    !!token &&
    typeof (token as { sub?: unknown }).sub === "string" &&
    typeof (token as { tid?: unknown }).tid === "string" &&
    typeof (token as { sid?: unknown }).sid === "string";

  if (!isValid) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/super-admin") ? "/super-admin/login" : AUTH_PAGE;
    url.search = "";
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }


  return NextResponse.next();
}

export const config = {
  /**
   * Runs on nearly every request, because custom-domain detection depends on
   * the Host header and therefore cannot be expressed as a path matcher.
   *
   * The cost is one string comparison for platform-host traffic, which returns
   * early before any token work. Static assets and image optimisation are
   * excluded since they can never be a page request.
   *
   * `robots.txt` and `sitemap.xml` are deliberately NOT excluded: on a custom
   * domain they must be rewritten to that site's own versions.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|woff|woff2|ttf|otf|map)$).*)",
  ],
};
