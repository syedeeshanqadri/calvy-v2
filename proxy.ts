import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { featureForApiPath, isFeatureEnabled } from "@/lib/flags";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io";

function subdomainMiddleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl.clone();

  // Strip port for local dev (e.g. localhost:3000)
  const hostname = host.replace(/:\d+$/, "");

  // Detect subdomain: anything before the root domain that isn't "www"
  const isSubdomain =
    hostname !== ROOT_DOMAIN &&
    hostname !== `www.${ROOT_DOMAIN}` &&
    hostname.endsWith(`.${ROOT_DOMAIN}`);

  if (isSubdomain) {
    // Never rewrite API routes — they must stay at /api/* on the main domain
    if (url.pathname.startsWith("/api/")) return null;

    const slug = hostname.replace(`.${ROOT_DOMAIN}`, "");
    // Rewrite /<path> → /<slug>/<path> internally
    const path = url.pathname === "/" ? "" : url.pathname;
    url.pathname = `/${slug}${path}`;
    return NextResponse.rewrite(url);
  }

  return null;
}

// Auth middleware wraps only dashboard/admin routes
const authMiddleware = withAuth(
  function middleware(req) {
    const subdomain = subdomainMiddleware(req);
    if (subdomain) return subdomain;
    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: { authorized: ({ token }) => !!token },
  }
);

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    // Request id for log correlation: keep a sane caller-supplied one, else mint one.
    const incoming = req.headers.get("x-request-id");
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();

    // Feature-flag guard: API entry points of disabled features return 404.
    const flag = featureForApiPath(pathname);
    if (flag && !isFeatureEnabled(flag)) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "x-request-id": requestId } });
    }

    // API routes skip auth middleware and subdomain rewrites.
    const headers = new Headers(req.headers);
    headers.set("x-request-id", requestId);
    return NextResponse.next({ request: { headers }, headers: { "x-request-id": requestId } });
  }

  // Already-authenticated users should never see the auth pages — send them
  // straight to the dashboard (which itself routes to onboarding if needed).
  if (pathname === "/login" || pathname === "/signup") {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Apply auth only for dashboard/admin/crm routes on main domain
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/crm")
  ) {
    return authMiddleware(req as Parameters<typeof authMiddleware>[0], {} as Parameters<typeof authMiddleware>[1]);
  }

  // For all other routes, only handle subdomain rewriting
  const rewrite = subdomainMiddleware(req);
  if (rewrite) return rewrite;

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)",
  ],
};
