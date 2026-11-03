import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { revalidateBusinessClaims } from "@/lib/sessionBusiness";
import { cookies } from "next/headers";
import { verifyTicket } from "@/lib/signedTicket";
import { SIGNUP_TICKET_PURPOSE } from "@/lib/signupTicket";
import { decideGoogleSignIn, verifyLinkIntent, LINK_COOKIE } from "@/lib/googleLink";
import { normalizeEmail, tryNormalizeEmail } from "@/lib/email-normalize";

// Case-insensitive user lookup; an exact lowercase match wins over legacy
// mixed-case duplicates.
async function findUserByEmail(email: string) {
  const e = normalizeEmail(email);
  const exact = await prisma.user.findUnique({ where: { email: e } });
  if (exact) return exact;
  return prisma.user.findFirst({
    where: { email: { equals: e, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
}

// OAuth providers are only registered when their credentials are configured,
// so the social buttons stay inert until env vars are set.
const oauthProviders: NextAuthOptions["providers"] = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}
if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  oauthProviders.push(
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    }),
  );
}

export const oauthEnabled = {
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  facebook: !!(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET),
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Throttle brute-force attempts per email address.
        const rl = await rateLimit(`login:${credentials.email.toLowerCase()}`, 10, 60_000);
        if (!rl.ok) throw new Error("TooManyAttempts");

        try {
          const user = await findUserByEmail(credentials.email);

          if (!user || !user.password) return null; // OAuth-only accounts have no password
          if (!await bcrypt.compare(credentials.password, user.password)) return null;
          if (!user.emailVerified) throw new Error("EmailNotVerified");

          return { id: user.id, name: user.name, email: user.email };
        } catch (e) {
          if (e instanceof Error && e.message === "EmailNotVerified") throw e;
          return null;
        }
      },
    }),
    // Passwordless sign-up: the sign-up response carries a short-lived signed ticket that opens the first session,
    // so the owner can start the wizard before they have verified the email or chosen a password.
    CredentialsProvider({
      id: "signup-ticket",
      name: "signup-ticket",
      credentials: { ticket: { label: "Ticket", type: "text" } },
      async authorize(credentials) {
        const userId = verifyTicket(SIGNUP_TICKET_PURPOSE, credentials?.ticket, process.env.NEXTAUTH_SECRET ?? "");
        if (!userId) return null;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        // Only a brand-new account (no password yet) can be opened this way.
        if (!user || user.password) return null;
        return { id: user.id, name: user.name, email: user.email, viaTicket: true } as { id: string; name: string; email: string };
      },
    }),
    // Customer accounts: a separate table, so owners and customers never share credentials.
    CredentialsProvider({
      id: "customer",
      name: "customer",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const email = tryNormalizeEmail(credentials?.email);
        if (!email || !credentials?.password) return null;
        const rl = await rateLimit(`customer-login:${email}`, 10, 60_000);
        if (!rl.ok) throw new Error("TooManyAttempts");
        const customer = await prisma.customer.findUnique({ where: { email } });
        // An account made at booking has no password yet: it signs in only after the emailed setup link.
        if (!customer?.password || !(await bcrypt.compare(credentials.password, customer.password))) return null;
        if (!customer.emailVerified) throw new Error("EmailNotVerified");
        return { id: customer.id, name: customer.name, email: customer.email, kind: "customer" } as { id: string; name: string; email: string };
      },
    }),
    ...oauthProviders,
  ],
  // 7-day sessions (refreshed at most once a day); the JWT lifetime matches.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  jwt: { maxAge: 7 * 24 * 60 * 60 },
  callbacks: {
    // For OAuth sign-ins, ensure a matching User exists (linked by verified
    // email). The business is created later in the onboarding step.
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials" || account.provider === "customer") return true;
      if (!user.email) return false; // provider didn't share an email — can't proceed
      const oauthEmail = tryNormalizeEmail(user.email);
      if (!oauthEmail) return false;
      const existing = await findUserByEmail(oauthEmail);

      if (account.provider === "google") {
        let linkIntentUserId: string | null = null;
        try {
          linkIntentUserId = verifyLinkIntent((await cookies()).get(LINK_COOKIE)?.value, process.env.NEXTAUTH_SECRET ?? "");
        } catch { /* no request context: no link intent */ }
        const d = decideGoogleSignIn({
          emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified === true,
          sub: account.providerAccountId,
          existing: existing ? { id: existing.id, password: existing.password, googleId: existing.googleId } : null,
          linkIntentUserId,
        });
        if (d.action === "deny") return d.reason === "password-account" ? "/login?error=GoogleLinkRequired" : "/login?error=GoogleDenied";
        try {
          if (d.action === "create") {
            await prisma.user.create({
              data: { name: user.name ?? oauthEmail.split("@")[0], email: oauthEmail, image: user.image ?? null, emailVerified: new Date(), googleId: account.providerAccountId },
            });
          } else if (existing && d.action === "link") {
            await prisma.user.update({ where: { id: existing.id }, data: { googleId: account.providerAccountId, emailVerified: existing.emailVerified ?? new Date() } });
          } else if (existing && !existing.emailVerified) {
            await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } });
          }
        } catch {
          return "/login?error=GoogleDenied"; // e.g. this Google account is already linked to another user
        }
        if (linkIntentUserId) { try { (await cookies()).delete(LINK_COOKIE); } catch { /* best effort */ } }
        return true;
      }

      if (!existing) {
        await prisma.user.create({
          data: { name: user.name ?? oauthEmail.split("@")[0], email: oauthEmail, image: user.image ?? null, emailVerified: new Date() },
        });
      } else if (!existing.emailVerified) {
        await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } });
      }
      return true;
    },
    async jwt({ token, user }) {
      // Customer sessions carry no business claims and never get any.
      if ((user as { kind?: string } | undefined)?.kind === "customer") {
        token.kind = "customer";
        token.customerId = user!.id;
        // Set at sign-in only (NextAuth re-issues the JWT daily, so iat cannot be used).
        token.customerAuthAt = Date.now();
        token.uid = undefined; token.role = undefined; token.businessId = undefined; token.businessSlug = undefined; token.businessName = undefined;
        return token;
      }
      if (token.kind === "customer") return token;
      if ((user as { viaTicket?: boolean } | undefined)?.viaTicket) token.ticketAuthAt = Date.now();
      // A session opened by a sign-up ticket ends the moment the account gets its password (the setup link). That
      // way someone who signed up with another person's email cannot keep a session once the real owner sets a password.
      if (!user && typeof token.ticketAuthAt === "number" && token.uid) {
        const u = await prisma.user.findUnique({ where: { id: token.uid as string }, select: { passwordChangedAt: true } });
        if (!u || (u.passwordChangedAt && u.passwordChangedAt.getTime() > (token.ticketAuthAt as number))) throw new Error("SessionRevoked");
      }
      // On sign-in, resolve our DB user by email (works for credentials + OAuth,
      // since OAuth token.sub is the provider's id, not ours).
      const rawEmail = (user?.email ?? token.email) as string | undefined;
      const email = tryNormalizeEmail(rawEmail) ?? undefined;
      if (user && email) {
        const found = await findUserByEmail(email);
        const dbUser = found
          ? await prisma.user.findUnique({ where: { id: found.id }, include: { business: true } })
          : null;
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.businessId = dbUser.business?.id;
          token.businessSlug = dbUser.business?.slug;
          token.businessName = dbUser.business?.name;
        }
      }
      // Every request: re-validate the business claims against the DB (throttled), so a
      // deleted/re-created business or a just-finished onboarding is picked up.
      if (user) token.bizCheckedAt = Date.now();
      else {
        await revalidateBusinessClaims(token, (ownerId) =>
          prisma.business.findUnique({ where: { ownerId }, select: { id: true, slug: true, name: true } }),
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string | undefined) ?? token.sub!;
        session.user.kind = token.kind;
        session.user.customerId = token.customerId;
        session.user.authAt = token.customerAuthAt;
        session.user.role = token.role as string | undefined;
        session.user.businessId = token.businessId as string | undefined;
        session.user.businessSlug = token.businessSlug as string | undefined;
        session.user.businessName = token.businessName as string | undefined;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};
