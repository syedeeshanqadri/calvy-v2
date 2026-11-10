import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { resolveAccess } from "@/lib/access";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
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
  let suspended = false;

  const access = await resolveAccess(session);
  if (session?.user?.businessId || (access && !access.isOwner)) {
    try {
      const biz = await prisma.business.findUnique({
        where: { id: access?.businessId ?? session?.user?.businessId },
        select: { currency: true, packId: true, termsOverride: true, bookingMode: true, onboardingCompletedAt: true, suspendedAt: true },
      });
      currency = biz?.currency ?? "USD";
      packId = biz?.packId;
      termsOverride = biz?.termsOverride;
      bookingMode = biz?.bookingMode;
      onboardingPending = !!biz && !biz.onboardingCompletedAt && !(access && !access.isOwner) && !session?.user?.viewAs;
      suspended = !!biz?.suspendedAt;
    } catch {
      // DB cold-start — fall back to USD, page will still render
    }
  } else if (session?.user?.id) {
    // No businessId in the token. This is either a fresh OAuth user who hasn't
    // finished onboarding, or a just-onboarded user whose token hasn't refreshed
    // yet — so check the DB authoritatively to avoid a redirect loop.
    const biz = await prisma.business.findUnique({
      where: { ownerId: session.user.id },
      select: { currency: true, packId: true, termsOverride: true, bookingMode: true, onboardingCompletedAt: true, suspendedAt: true },
    });
    if (!biz) {
      // A Calvy admin whose view-as ended has no business of their own: back to the admin area, never into the sign-up wizard.
      const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isSuperAdmin: true } });
      if (me?.isSuperAdmin) redirect("/admin");
    }
    if (!biz || !biz.onboardingCompletedAt) redirect("/onboarding");
    currency = biz.currency ?? "USD";
    packId = biz.packId;
    termsOverride = biz.termsOverride;
    bookingMode = biz.bookingMode;
    suspended = !!biz.suspendedAt;
  }

  // redirect() throws, so it stays outside the try/catch above. Team members never see the wizard.
  if (onboardingPending) redirect("/onboarding");

  const viewAs = session?.user?.viewAs;

  return (
    <FlagsProvider flags={getFlags()}>
      <AccessProvider value={{ isOwner: access?.isOwner ?? true, permissions: access?.permissions ?? [] }}>
        <CurrencyProvider currency={currency}>
          <TermsProvider packId={packId} termsOverride={termsOverride} bookingMode={bookingMode}>
            {viewAs && <ViewAsBanner mode={viewAs.mode} businessName={viewAs.businessName} expiresAt={viewAs.expiresAt} businessId={session?.user?.businessId ?? ""} />}
            {suspended && !viewAs && (
              <div role="status" className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2 text-center">
                Your account is temporarily suspended: new bookings are paused. Existing bookings and reminders carry on. Please contact Calvy support.
              </div>
            )}
            {/* With the red banner on top, the dashboard shell fills what is left of the screen. */}
            <div className={viewAs ? "h-[calc(100dvh-2.5rem)] [&>div]:!h-full" : undefined}>{children}</div>
          </TermsProvider>
        </CurrencyProvider>
      </AccessProvider>
    </FlagsProvider>
  );
}
