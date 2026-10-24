// Keeps the business claims in the NextAuth JWT in step with the database, so a
// deleted or re-created business (re-seed, admin cleanup) never leaves a session
// pointing at an id that no longer exists (which renders an empty dashboard).

export const BUSINESS_REVALIDATE_MS = 30_000;

export interface BusinessClaims {
  uid?: unknown;
  businessId?: unknown;
  businessSlug?: unknown;
  businessName?: unknown;
  bizCheckedAt?: unknown;
}

export type BusinessLoader = (ownerId: string) => Promise<{ id: string; slug: string; name: string } | null>;

/**
 * Re-reads the owner's business at most once per BUSINESS_REVALIDATE_MS (or when the
 * token has no check time yet) and rewrites or clears the claims when they differ.
 * Mutates and returns the token. On a loader error the token is left as it was.
 */
export async function revalidateBusinessClaims<T extends BusinessClaims>(
  token: T,
  load: BusinessLoader,
  now: number = Date.now(),
): Promise<T> {
  if (typeof token.uid !== "string") return token;
  const checked = typeof token.bizCheckedAt === "number" ? token.bizCheckedAt : 0;
  if (now - checked < BUSINESS_REVALIDATE_MS) return token;
  try {
    const biz = await load(token.uid);
    token.businessId = biz?.id;
    token.businessSlug = biz?.slug;
    token.businessName = biz?.name;
    token.bizCheckedAt = now;
  } catch {
    // Database hiccup: keep the existing claims and retry on the next request.
  }
  return token;
}
