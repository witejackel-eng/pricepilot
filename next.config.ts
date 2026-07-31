import type { NextConfig } from "next";

/**
 * Phase 15 (production-readiness): Security headers.
 *
 * - Content-Security-Policy: restricts script/style/font/image sources
 *   to 'self' and a small allowlist. No 'unsafe-inline' for scripts.
 *   Style allows 'unsafe-inline' because Next.js + Tailwind inject
 *   inline styles during hydration.
 * - X-Content-Type-Options: nosniff
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: deny camera, microphone, geolocation (the app
 *   does not use any of these).
 * - X-Frame-Options: DENY (defence in depth alongside CSP frame-ancestors).
 * - Strict-Transport-Security: 1 year, includeSubDomains (Vercel
 *   already enforces HTTPS, but the header adds browser-level
 *   protection against downgrade attacks).
 *
 * Vercel adds some of these automatically, but setting them here
 * guarantees they are present in every environment (including local
 * `bun run start` and any future hosting change).
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects inline styles during hydration + Tailwind
      // utility classes. We need 'unsafe-inline' for styles.
      "style-src 'self' 'unsafe-inline'",
      // Fonts may come from Google Fonts in some deployments — allow
      // self + data: (for inlined font data URIs). No external font CDN
      // by default.
      "font-src 'self' data:",
      // Images may be data URIs (base64) or same-origin.
      "img-src 'self' data: blob:",
      // Next.js injects inline framework and hydration scripts during
      // SSR. For a statically generated application, 'unsafe-inline' is
      // the documented non-nonce approach that permits these scripts.
      // Do NOT add 'unsafe-eval' in production.
      "script-src 'self' 'unsafe-inline'",
      // Connections (fetch, XHR, WebSocket) — self only.
      "connect-src 'self'",
      // No external frames allowed.
      "frame-ancestors 'none'",
      // No plugins.
      "object-src 'none'",
      // Base URL must be self (defence against <base> tag injection).
      "base-uri 'self'",
      // Form actions must target self.
      "form-action 'self'",
      // Upgrade insecure requests (defence in depth).
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The original `allowedDevOrigins: ["21.0.20.245"]` was a stale
  // development-only entry that has no purpose in production. Removed.
  async headers() {
    return [
      {
        // Apply security headers to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
