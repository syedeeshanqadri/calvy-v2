// Who may enter which area (pure). Customers and business owners sign in through the same NextAuth
// session, told apart by the `kind` claim: a customer token never opens the owner areas, and an
// owner token never opens customer APIs.
export interface AccessToken { kind?: unknown; customerId?: unknown; businessId?: unknown }

export const isCustomerToken = (t: AccessToken | null | undefined): boolean =>
  !!t && t.kind === "customer" && typeof t.customerId === "string";

/** /dashboard, /admin and /crm: any signed-in token that is not a customer's. */
export const canAccessOwnerArea = (t: AccessToken | null | undefined): boolean => !!t && !isCustomerToken(t);

/** The customer id a session may act as, or null. Owners get null. */
export const customerIdOf = (t: AccessToken | null | undefined): string | null =>
  isCustomerToken(t) ? (t!.customerId as string) : null;
