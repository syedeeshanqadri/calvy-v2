// Content-Security-Policy is ENFORCED. Allow-list, by purpose:
//   scripts   Cashfree checkout SDK, Meta (Facebook) JS SDK for WhatsApp Embedded Signup.
//   forms     PayU, CCAvenue and Paytm take the customer over with a form POST to their own page (lib/payments/launchCheckout.ts);
//             the other gateways (Razorpay, PhonePe, Stripe, PayPal) are plain redirects, which CSP does not restrict.
//   frames    Google Maps embed on tenant sites, Cashfree and Meta (Embedded Signup) frames.
//   Vercel    uploads to Vercel Blob; Vercel Analytics is served from our own origin (/_vercel/...).
// Known limit: script-src keeps 'unsafe-inline' because Next's own bootstrap scripts are inline; a nonce policy would force every
// page (blog ISR, tenant sites) to render dynamically. 'unsafe-eval' is development-only (React refresh).
// Framing: only our own pages (the onboarding "You're live" preview embeds the new site). Everyone else stays blocked.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://sdk.cashfree.com https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  // Tenant uploads live on Vercel Blob (*.public.blob.vercel-storage.com); any other https image (an R2 domain, a pasted link) is allowed too.
  "img-src 'self' data: blob: https: https://*.public.blob.vercel-storage.com",
  "font-src 'self' data:",
  "frame-src https://www.google.com https://*.cashfree.com https://www.facebook.com https://web.facebook.com",
  `connect-src 'self' https://*.public.blob.vercel-storage.com https://*.cashfree.com https://*.facebook.com https://*.facebook.net https://*.ingest.sentry.io https://*.ingest.us.sentry.io${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' https://*.public.blob.vercel-storage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.cashfree.com https://secure.payu.in https://test.payu.in https://secure.ccavenue.com https://test.ccavenue.com https://securegw.paytm.in https://securegw-stage.paytm.in",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

// Pages and redirects whose URL can carry a one-hour credit / follow-up ticket or a payment order id never leak it
// through the Referer header: no-referrer. Everything else keeps the site-wide policy above. Later rules win.
// (A tenant subdomain request arrives as /book, before the proxy rewrites it, so that path is listed too.)
const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
const noReferrerSources = [
  "/:slug/book",
  "/book",
  "/:slug/book-now",
  "/book-now",
  "/b/:slug",
  "/booking/:path*",
  "/api/customer/use-credit",
  "/api/customer/follow-up",
  "/api/payments/:path*",
];

// Old addresses, kept as permanent 301s so any link already sent keeps working (queries such as ?service=&date= are carried over).
//   /b/{slug}            -> /{slug}/book          (the duplicate booking page was removed; /{slug}/book-now stays as an alias)
//   /my/*                -> /account/*            (customer account)
//   /{slug}/q/{code}     -> /booking/{code}       (live queue tracking; also /q/{code} on a tenant subdomain)
export const LEGACY_REDIRECTS = [
  { source: "/b/:slug", destination: "/:slug/book", statusCode: 301 },
  { source: "/my", destination: "/account", statusCode: 301 },
  { source: "/my/:path*", destination: "/account/:path*", statusCode: 301 },
  { source: "/:slug/q/:code", destination: "/booking/:code", statusCode: 301 },
  { source: "/q/:code", destination: "/booking/:code", statusCode: 301 },
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
  async redirects() {
    return LEGACY_REDIRECTS;
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...noReferrerSources.map((source) => ({ source, headers: noReferrer })),
    ];
  },
};

export default nextConfig;
