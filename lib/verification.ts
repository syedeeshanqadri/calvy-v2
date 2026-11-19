// "Verify your email" gates. An owner who signed up with an email (not Google) is unverified until they use a link. Most of the product works
// without it; these few things do not, because they move money, reach customers or hand out access:
//   gateway  connecting or changing payment gateways         (API paths, refused in proxy.ts: nothing in the gateway code changes)
//   whatsapp connecting WhatsApp                              (API paths, refused in proxy.ts)
//   export   downloading customer, appointment or payment data (API paths, refused in proxy.ts)
//   team     adding or widening a team member with manager-level access (checked in the team routes)
//   email    changing the account email                       (no such feature yet; the helper is here for when it exists)
// The proxy/API answer is a 403 with code EMAIL_NOT_VERIFIED; the pages show an inline "Verify your email to continue" with a resend button.
import { NextResponse } from "next/server";
import type { Permission } from "@/lib/permissions";

export type VerifyGate = "gateway" | "whatsapp" | "export" | "team" | "email";
export const VERIFY_CODE = "EMAIL_NOT_VERIFIED";
export const VERIFY_MESSAGE = "Verify your email to continue.";

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Pure: which gate (if any) an API request falls under. Reads of settings are open; writes and data downloads are gated. */
export function verifyGateForApi(method: string, rawPathname: string): VerifyGate | null {
  const path = rawPathname.replace(/\/+$/, "") || "/";
  const m = method.toUpperCase();
  if (WRITE.has(m) && (path === "/api/settings/gateways" || path.startsWith("/api/settings/gateways/"))) return "gateway";
  if (WRITE.has(m) && (path === "/api/settings/whatsapp" || path.startsWith("/api/settings/whatsapp/"))) return "whatsapp";
  if (m === "GET" && /^\/api\/(appointments|clients|payments)\/export$/.test(path)) return "export";
  return null;
}

/** Permissions that make a team member a manager in practice: they see money, export customers or change how the business notifies and presents itself. */
const MANAGER_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(["reports.view", "customers.export", "notifications.settings", "reviews.settings", "website.edit"]);
export function isManagerLike(permissions: readonly string[], roleName?: string | null): boolean {
  return /\b(owner|manager|admin)\b/i.test(roleName ?? "") || permissions.some((p) => MANAGER_PERMISSIONS.has(p as Permission));
}

export function unverifiedResponse(gate: VerifyGate): NextResponse {
  return NextResponse.json({ error: VERIFY_MESSAGE, code: VERIFY_CODE, gate }, { status: 403 });
}

/** Server check for routes that gate themselves: is this owner's email verified (read from the database, never from a token)? */
export async function ownerEmailVerified(userId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  return !!u?.emailVerified;
}
