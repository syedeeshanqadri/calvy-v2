import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string;
      businessId?: string;
      businessSlug?: string;
      businessName?: string;
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
  }
}
