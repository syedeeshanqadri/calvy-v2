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
  }
}
