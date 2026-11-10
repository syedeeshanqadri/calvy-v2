import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { featureForApiPath, isFeatureEnabled } from "@/lib/flags";
import { canAccessOwnerArea, isCustomerToken } from "@/lib/customerAccess";
import { ALWAYS_OPEN, ROUTE_PERMISSIONS } from "@/lib/permissions";

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
    // A customer account is signed in, but never into the owner areas.
    callbacks: { authorized: ({ token }) => canAccessOwnerArea(token) },
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

    // Calvy admin view-as: a read-only view-as refuses EVERY write here, in front of every route (also routes that are
    // not wrapped in safeRoute), and acting never reaches owner-only areas. Only requests carrying the admin cookie
    // cost anything; the rule itself lives in lib/admin/guard.ts (viewAsBlock).
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.cookies.get("calvy_admin")?.value) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (token?.sa && typeof token.uid === "string") {
        const { viewAsForToken } = await import("@/lib/admin/viewAs");
        const { viewAsBlock } = await import("@/lib/admin/guard");
        const v = await viewAsForToken(token.uid, req.cookies.get("calvy_admin")?.value).catch(() => null);
        const blocked = viewAsBlock(v?.mode, req.method, pathname);
        if (blocked) return blocked;
      }
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
      url.pathname = isCustomerToken(token) ? "/my" : "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Apply auth only for dashboard/crm routes on main domain. /admin is NOT redirected to login: its layout answers
  // everyone who is not a signed-in super admin with the same 404 as a page that does not exist (lib/admin/auth.ts).
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/crm")
  ) {
    // Team members: only the pages that some permission can open. The page itself then checks the exact
    // permission against the database (lib/access.ts); this is the coarse first wall for owner-only areas.
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token?.role === "member") {
      const listed = pathname === "/dashboard" || ALWAYS_OPEN.includes(pathname) || ROUTE_PERMISSIONS.some((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
      if (!listed) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
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
