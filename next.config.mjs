// Content-Security-Policy is ENFORCED. Allow-list, by purpose:
//   scripts   Cashfree checkout SDK, Meta (Facebook) JS SDK for WhatsApp Embedded Signup.
//   forms     PayU, CCAvenue and Paytm take the customer over with a form POST to their own page (lib/payments/launchCheckout.ts);
//             the other business gateways (PhonePe, Stripe, PayPal, and a business's own Razorpay) are plain redirects, which CSP does not restrict.
//   frames    Google Maps embed on tenant sites, Cashfree and Meta (Embedded Signup) frames, and our OWN pages: the onboarding
//             "You're live" preview embeds the new site (same origin, or a tenant subdomain *.<root domain>).
//   Razorpay  Calvy's own plan billing for international businesses opens Razorpay Checkout. Its script, frames and calls are allowed ONLY on
//             /dashboard/billing (the one page that opens it), not site-wide.
//   Vercel    uploads to Vercel Blob (server side); Vercel Analytics is served from our own origin (/_vercel/...).
// Known limit: script-src keeps 'unsafe-inline' because Next's own bootstrap scripts are inline; a nonce policy would force every
// page (blog ISR, tenant sites) to render dynamically. 'unsafe-eval' is development-only (React refresh).
//
// Framing (frame-ancestors): PUBLIC pages, which include every tenant site, may be framed by our own origin and our own tenant subdomains, so the
// dashboard's site preview works when the app runs on calvy.io with wildcard subdomains. Third-party sites are always blocked. Private pages
// (dashboard, admin, CRM, account, sign-in) may only be framed by their own origin.
const isDev = process.env.NODE_ENV !== "production";

/** The root domain from NEXT_PUBLIC_ROOT_DOMAIN (never hard-coded), without scheme, path or port. */
const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").toLowerCase();
/** Same rule as usesTenantSubdomains() in lib/siteBase.ts: only a real domain with wildcard DNS serves tenants on subdomains. */
const tenantSubdomains = !!rootDomain && rootDomain !== "localhost" && !rootDomain.endsWith(".localhost") && !rootDomain.endsWith(".vercel.app") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(rootDomain);
const ownOrigins = tenantSubdomains ? [`https://${rootDomain}`, `https://*.${rootDomain}`] : [];

/** Razorpay Checkout (Calvy plan billing). Only on /dashboard/billing. */
const RAZORPAY = {
  script: ["https://checkout.razorpay.com"],
  frame: ["https://api.razorpay.com", "https://checkout.razorpay.com"],
  connect: ["https://api.razorpay.com", "https://lumberjack.razorpay.com"],
  img: ["https://cdn.razorpay.com"],
};

/**
 * One full policy. `ancestors`: "public" lets our own origin and tenant subdomains frame the page; "private" only the page's own origin.
 * `extra` adds sources per directive (used for Razorpay on the billing page).
 */
export function buildCsp({ ancestors = "public", extra = {} } = {}) {
  const more = (k) => (extra[k] ?? []).join(" ");
  const list = (...parts) => parts.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    list(`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://sdk.cashfree.com https://connect.facebook.net`, more("script")),
    "style-src 'self' 'unsafe-inline'",
    // Tenant uploads live on Vercel Blob (*.public.blob.vercel-storage.com); any other https image (an R2 domain, a pasted link) is allowed too.
    list("img-src 'self' data: blob: https: https://*.public.blob.vercel-storage.com", more("img")),
    "font-src 'self' data:",
    list("frame-src 'self'", ownOrigins.join(" "), "https://www.google.com https://*.cashfree.com https://www.facebook.com https://web.facebook.com", more("frame")),
    list(`connect-src 'self' https://*.public.blob.vercel-storage.com https://*.cashfree.com https://*.facebook.com https://*.facebook.net https://*.ingest.sentry.io https://*.ingest.us.sentry.io${isDev ? " ws://localhost:* http://localhost:*" : ""}`, more("connect")),
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' https://*.public.blob.vercel-storage.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.cashfree.com https://secure.payu.in https://test.payu.in https://secure.ccavenue.com https://test.ccavenue.com https://securegw.paytm.in https://securegw-stage.paytm.in",
    ancestors === "public" ? list("frame-ancestors 'self'", ownOrigins.join(" ")) : "frame-ancestors 'self'",
  ].join("; ");
}

// Pages that must never be framed by another site or subdomain.
const privateSources = ["/dashboard/:path*", "/admin/:path*", "/crm/:path*", "/account/:path*", "/login", "/signup", "/onboarding/:path*"];

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
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
    const csp = (value) => ({ key: "Content-Security-Policy", value });
    const framing = { key: "X-Frame-Options", value: "SAMEORIGIN" };
    return [
      // Every page: the public policy (framable by our own origin and tenant subdomains).
      { source: "/:path*", headers: [...securityHeaders, csp(buildCsp({ ancestors: "public" }))] },
      // Private pages: only their own origin may frame them. Later rules win.
      ...privateSources.map((source) => ({ source, headers: [csp(buildCsp({ ancestors: "private" })), framing] })),
      // The billing page opens Razorpay Checkout (international plan billing): its script, frames and calls are allowed here and nowhere else.
      { source: "/dashboard/billing", headers: [csp(buildCsp({ ancestors: "private", extra: { script: RAZORPAY.script, frame: RAZORPAY.frame, connect: RAZORPAY.connect, img: RAZORPAY.img } })), framing] },
      ...noReferrerSources.map((source) => ({ source, headers: noReferrer })),
    ];
  },
};

export default nextConfig;
