import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFlags } from "@/lib/flags";
import { FlagsProvider } from "@/components/providers/FlagsProvider";
import { CurrencyProvider } from "@/components/providers/CurrencyProvider";
import { TermsProvider } from "@/components/providers/TermsProvider";

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  let currency = "USD";
  let packId: string | undefined;
  let termsOverride: unknown;

  if (session?.user?.businessId) {
    try {
      const biz = await prisma.business.findUnique({
        where: { id: session.user.businessId },
        select: { currency: true, packId: true, termsOverride: true },
      });
      currency = biz?.currency ?? "USD";
      packId = biz?.packId;
      termsOverride = biz?.termsOverride;
    } catch {
      // DB cold-start — fall back to USD, page will still render
    }
  } else if (session?.user?.id) {
    // No businessId in the token. This is either a fresh OAuth user who hasn't
    // finished onboarding, or a just-onboarded user whose token hasn't refreshed
    // yet — so check the DB authoritatively to avoid a redirect loop.
    const biz = await prisma.business.findUnique({
      where: { ownerId: session.user.id },
      select: { currency: true, packId: true, termsOverride: true },
    });
    if (!biz) redirect("/onboarding");
    currency = biz.currency ?? "USD";
    packId = biz.packId;
    termsOverride = biz.termsOverride;
  }

  return (
    <FlagsProvider flags={getFlags()}>
      <CurrencyProvider currency={currency}>
        <TermsProvider packId={packId} termsOverride={termsOverride}>{children}</TermsProvider>
      </CurrencyProvider>
    </FlagsProvider>
  );
}
