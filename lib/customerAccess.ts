// Who may enter which area (pure). Customers and business owners sign in through the same NextAuth
// session, told apart by the `kind` claim: a customer token never opens the owner areas, and an
// owner token never opens customer APIs.
export interface AccessToken { kind?: unknown; customerId?: unknown; businessId?: unknown }

export const isCustomerToken = (t: AccessToken | null | undefined): boolean =>
  !!t && t.kind === "customer" && typeof t.customerId === "string";

/** /dashboard, /admin and /crm: any signed-in token that is not a customer's. */
export const canAccessOwnerArea = (t: AccessToken | null | undefined): boolean => !!t && !isCustomerToken(t);

/** A customer session ends when the password changes after it began (a stolen or old session must not survive a reset). */
export const customerSessionCurrent = (authAt: unknown, passwordChangedAt: Date | null | undefined): boolean =>
  !passwordChangedAt || (typeof authAt === "number" && authAt >= passwordChangedAt.getTime());

/** The customer id a session may act as, or null. Owners get null. */
export const customerIdOf = (t: AccessToken | null | undefined): string | null =>
  isCustomerToken(t) ? (t!.customerId as string) : null;
