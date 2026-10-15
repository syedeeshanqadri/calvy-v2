import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type AdminCandidate = { role?: string | null; email?: string | null } | null | undefined;

/**
 * The single admin check. An unset or empty SUPER_ADMIN_EMAIL never matches,
 * and a missing user email never matches.
 */
export function isAdminUser(user: AdminCandidate): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const superEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const email = user.email?.trim().toLowerCase();
  return !!superEmail && !!email && email === superEmail;
}

export async function isAdminSession(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return isAdminUser(session?.user);
}

// Normalize an FAQ array from request input into a stored JSON string.
export function normalizeFaq(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const items = input
    .map((x) => {
      const o = (x ?? {}) as { q?: unknown; a?: unknown };
      return { q: String(o.q ?? "").trim(), a: String(o.a ?? "").trim() };
    })
    .filter((x) => x.q && x.a)
    .slice(0, 20);
  return JSON.stringify(items);
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "post";
}
