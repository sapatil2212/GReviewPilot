import type { NextConfig } from "next";

/**
 * Security headers applied to every response. Kept intentionally
 * strict — relax on a per-page basis via route-level headers rather
 * than loosening the defaults.
 *
 * - X-Frame-Options: DENY blocks clickjacking; `object-src 'none'`
 *        would disable plugins if a CSP is added later.
 * - HSTS: 1 year, includeSubDomains, preload-ready.
 * - Referrer-Policy: strict-origin-when-cross-origin (default good).
 */
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        /**
         * Everything except /template-preview.
         *
         * The exclusion is expressed as a negative lookahead rather than by
         * overriding X-Frame-Options in a later rule: two matching rules would
         * emit the header twice, and browsers treat a duplicated
         * X-Frame-Options as invalid and fall back to blocking the frame. One
         * rule per response keeps the outcome deterministic.
         */
        source: "/((?!template-preview).*)",
        headers: [...baseSecurityHeaders, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        /**
         * Template previews are rendered inside an iframe by the website
         * gallery at /dashboard/website, so they cannot be DENY. SAMEORIGIN
         * still blocks every external site from framing them, which is the
         * clickjacking protection that matters — and these pages carry no
         * tenant data and no actions to hijack (demo content, sandboxed
         * without allow-forms) so the residual surface is nil.
         */
        source: "/template-preview/:path*",
        headers: [...baseSecurityHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
