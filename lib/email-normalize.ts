/** Canonical form for storing and looking up emails: trimmed and lowercased. */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") throw new TypeError("email must be a string");
  return email.trim().toLowerCase();
}

/** Like normalizeEmail but returns null instead of throwing. */
export function tryNormalizeEmail(email: unknown): string | null {
  return typeof email === "string" ? email.trim().toLowerCase() : null;
}

type ClientFinder<T> = {
  client: {
    findFirst(args: {
      where: { businessId: string; email: string | { equals: string; mode: "insensitive" } };
    }): Promise<T | null>;
  };
};

/**
 * Find a client by email inside one business, case-insensitively. An exact
 * lowercase match wins if legacy mixed-case duplicates exist.
 */
export async function findClientByEmail<T>(db: ClientFinder<T>, businessId: string, email: string): Promise<T | null> {
  const e = normalizeEmail(email);
  const exact = await db.client.findFirst({ where: { businessId, email: e } });
  if (exact) return exact;
  return db.client.findFirst({ where: { businessId, email: { equals: e, mode: "insensitive" } } });
}
