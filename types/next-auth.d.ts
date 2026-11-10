import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string;
      businessId?: string;
      businessSlug?: string;
      businessName?: string;
      /** "customer" for customer accounts; absent for business owners. */
      kind?: string;
      customerId?: string;
      /** When this customer signed in (ms); a password change after it ends the session. */
      authAt?: number;
      /** A Calvy super admin viewing a business: the business claims above are the VIEWED business, not the admin's own. */
      viewAs?: { mode: "READ" | "ACT"; expiresAt: string; businessName: string };
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
    businessId?: string;
    businessSlug?: string;
    businessName?: string;
    kind?: string;
    customerId?: string;
    customerAuthAt?: number;
    /** The user was a Calvy super admin at sign-in. Only a hint to look up an admin session: the database decides. */
    sa?: boolean;
  }
}
