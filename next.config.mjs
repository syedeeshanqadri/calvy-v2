// Content-Security-Policy runs in REPORT-ONLY mode first: it logs violations in
// the browser console without blocking anything. Tighten (drop 'unsafe-inline'
// via nonces) and switch to `Content-Security-Policy` once the console is clean.
const csp = [
  "default-src 'self'",
  // Cashfree checkout SDK (online booking payments).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.cashfree.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-src https://www.google.com https://*.cashfree.com",
  "connect-src 'self' https://*.public.blob.vercel-storage.com https://*.cashfree.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.cashfree.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Dev-only "N" badge defaults to bottom-left, where it covers the dashboard sidebar's Settings link.
  devIndicators: { position: "bottom-right" },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "ui-avatars.com" },
      // Vercel Blob (tenant and blog uploads)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
