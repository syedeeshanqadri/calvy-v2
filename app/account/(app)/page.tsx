import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCustomerData } from "@/lib/customerData";
import { prisma } from "@/lib/prisma";
import { BookingCard } from "@/components/my/BookingCard";
import { PageHeader } from "@/components/my/PageHeader";
import { LevelHero } from "@/components/my/LevelHero";
import { EmptyState, ReferralCard, SectionHeading, StampsCard, StreakCard } from "@/components/my/AccountCards";
import { RateVisits } from "@/components/my/RateVisits";
import { NotificationsCard, SetPasswordCard, ThisDeviceCard } from "@/components/my/SettingsParts";
import { LinkGoogle } from "@/components/settings/LinkGoogle";
import { VerifyNotice, ProfileCard, DeleteAccountCard } from "./MyClient";
import { LevelUpCelebration } from "./LevelUpCelebration";
import { ForgetDevice } from "./ForgetDevice";

export const dynamic = "force-dynamic";

/** /account: the customer's home. Level first, then stamps / streak / referral, upcoming, past, rate your visits, and settings last. */
export default async function MyOverviewPage() {
  const data = await getCustomerData();
  if (!data) return null; // the layout already sent guests to sign in

  const first = data.me.name.split(" ")[0];
  if (!data.verified) {
    return (
      <>
        <PageHeader title={`Hi ${first}`} subtitle="One more step before you can see your bookings." />
        <VerifyNotice email={data.me.email} />
      </>
    );
  }

  const { upcoming, past, reward, level, referral, feeApplies, unsubscribe } = data;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io";
  const referralUrl = referral ? `https://${referral.slug}.${rootDomain}/book?cref=${referral.code}` : null;
  const bookAgain = past[0]?.bookAgainHref ?? null;
  const [account, deletion] = await Promise.all([
    prisma.customer.findUnique({ where: { id: data.me.id }, select: { password: true } }),
    prisma.customerDeletionRequest.findUnique({ where: { customerId: data.me.id }, select: { status: true, executeAfter: true } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-8 lg:space-y-10">
      <PageHeader title={`Hi ${first}`} subtitle={`Your bookings with ${data.me.email}`} />
      {level?.pendingLevelUp && <LevelUpCelebration level={level.pendingLevelUp.label} feeLabel={`\u20B9${level.feeMinor / 100}`} perk={level.perk} />}

      {level && <LevelHero level={level.level} perk={level.perk} feeApplies={feeApplies} feeMinor={level.feeMinor} baseFeeMinor={level.baseFeeMinor} progressRatio={level.progressRatio} />}

      {(reward || level || referral) && (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="grid grid-cols-1 gap-4 lg:gap-6 [&>section]:min-w-0">
            {reward && <StampsCard done={reward.done} of={reward.of} available={reward.available} bookHref={bookAgain} />}
            {level && <StreakCard months={level.streakMonths} />}
          </div>
          <ReferralCard code={referral?.code ?? null} url={referralUrl} baseFeeMinor={level?.baseFeeMinor ?? 1000} />
        </div>
      )}

      <section aria-labelledby="upcoming">
        <SectionHeading id="upcoming" title="Upcoming" action={upcoming.length > 3 ? <Link href="/account/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-cv-blue hover:underline">All bookings <ArrowRight size={14} aria-hidden /></Link> : undefined} />
        {upcoming.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 [&>li]:min-w-0">
            {upcoming.slice(0, 4).map((b, i) => <BookingCard key={b.id} b={b} highlight={i === 0} />)}
          </ul>
        ) : (
          <EmptyState title="Nothing coming up" body={bookAgain ? "Book your next visit with a business you have used." : "Book through any business's Calvy booking page and it will appear here."}
            cta={bookAgain ? { href: bookAgain, label: "Book again", external: true } : { href: "/help", label: "How booking works" }} />
        )}
      </section>

      <section aria-labelledby="past">
        <SectionHeading id="past" title="Past bookings" action={past.length > 3 ? <Link href="/account/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-cv-blue hover:underline">See all <ArrowRight size={14} aria-hidden /></Link> : undefined} />
        {past.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 [&>li]:min-w-0">{past.slice(0, 4).map((b) => <BookingCard key={b.id} b={b} />)}</ul>
        ) : (
          <EmptyState title="No past visits yet" body="Your finished visits will appear here, with a quick way to book again and leave a review." />
        )}
      </section>

      <RateVisits visits={past} />

      <section aria-labelledby="settings">
        <SectionHeading id="settings" title="Settings" />
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="space-y-4 lg:space-y-6">
            <ProfileCard name={data.me.name} email={data.me.email} />
            {!account?.password && <SetPasswordCard />}
            <LinkGoogle endpoint="/api/customer/google" provider="google-customer" callbackUrl="/account" className="acct-card p-5" />
          </div>
          <div className="space-y-4 lg:space-y-6">
            <NotificationsCard links={unsubscribe} />
            <ThisDeviceCard><ForgetDevice /></ThisDeviceCard>
            <DeleteAccountCard email={data.me.email} pendingUntil={deletion?.status === "PENDING" ? deletion.executeAfter.toISOString() : null} />
          </div>
        </div>
      </section>
    </div>
  );
}
