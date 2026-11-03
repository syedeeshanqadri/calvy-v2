import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { resolveAccess } from "@/lib/access";
import { AccessProvider } from "@/components/providers/AccessProvider";
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
  let bookingMode: string | undefined;
  let onboardingPending = false;

  const access = await resolveAccess(session);
  if (session?.user?.businessId || (access && !access.isOwner)) {
    try {
      const biz = await prisma.business.findUnique({
        where: { id: access?.businessId ?? session?.user?.businessId },
        select: { currency: true, packId: true, termsOverride: true, bookingMode: true, onboardingCompletedAt: true },
      });
      currency = biz?.currency ?? "USD";
      packId = biz?.packId;
      termsOverride = biz?.termsOverride;
      bookingMode = biz?.bookingMode;
      onboardingPending = !!biz && !biz.onboardingCompletedAt && !(access && !access.isOwner);
    } catch {
      // DB cold-start — fall back to USD, page will still render
    }
  } else if (session?.user?.id) {
    // No businessId in the token. This is either a fresh OAuth user who hasn't
    // finished onboarding, or a just-onboarded user whose token hasn't refreshed
    // yet — so check the DB authoritatively to avoid a redirect loop.
    const biz = await prisma.business.findUnique({
      where: { ownerId: session.user.id },
      select: { currency: true, packId: true, termsOverride: true, bookingMode: true, onboardingCompletedAt: true },
    });
    if (!biz || !biz.onboardingCompletedAt) redirect("/onboarding");
    currency = biz.currency ?? "USD";
    packId = biz.packId;
    termsOverride = biz.termsOverride;
    bookingMode = biz.bookingMode;
  }

  // redirect() throws, so it stays outside the try/catch above. Team members never see the wizard.
  if (onboardingPending) redirect("/onboarding");

  return (
    <FlagsProvider flags={getFlags()}>
      <AccessProvider value={{ isOwner: access?.isOwner ?? true, permissions: access?.permissions ?? [] }}>
        <CurrencyProvider currency={currency}>
          <TermsProvider packId={packId} termsOverride={termsOverride} bookingMode={bookingMode}>{children}</TermsProvider>
        </CurrencyProvider>
      </AccessProvider>
    </FlagsProvider>
  );
}
