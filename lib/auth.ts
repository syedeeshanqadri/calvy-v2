import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
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
        const rl = rateLimit(`login:${credentials.email.toLowerCase()}`, 10, 60_000);
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
    ...oauthProviders,
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // For OAuth sign-ins, ensure a matching User exists (linked by verified
    // email). The business is created later in the onboarding step.
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;
      if (!user.email) return false; // provider didn't share an email — can't proceed

      const oauthEmail = tryNormalizeEmail(user.email);
      if (!oauthEmail) return false;
      const existing = await findUserByEmail(oauthEmail);
      if (!existing) {
        await prisma.user.create({
          data: {
            name: user.name ?? oauthEmail.split("@")[0],
            email: oauthEmail,
            image: user.image ?? null,
            emailVerified: new Date(), // OAuth emails are pre-verified
          },
        });
      } else if (!existing.emailVerified) {
        await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } });
      }
      return true;
    },
    async jwt({ token, user }) {
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
      } else if (token.uid && !token.businessId) {
        // Refresh once the user completes onboarding (business now exists).
        const dbUser = await prisma.user.findUnique({
          where: { id: token.uid as string },
          include: { business: true },
        });
        if (dbUser?.business) {
          token.businessId = dbUser.business.id;
          token.businessSlug = dbUser.business.slug;
          token.businessName = dbUser.business.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string | undefined) ?? token.sub!;
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
