import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFlags } from "@/lib/flags";
import { FlagsProvider } from "@/components/providers/FlagsProvider";
import { CurrencyProvider } from "@/components/providers/CurrencyProvider";

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  let currency = "USD";

  if (session?.user?.businessId) {
    try {
      const biz = await prisma.business.findUnique({
        where: { id: session.user.businessId },
        select: { currency: true },
      });
      currency = biz?.currency ?? "USD";
    } catch {
      // DB cold-start — fall back to USD, page will still render
    }
  } else if (session?.user?.id) {
    // No businessId in the token. This is either a fresh OAuth user who hasn't
    // finished onboarding, or a just-onboarded user whose token hasn't refreshed
    // yet — so check the DB authoritatively to avoid a redirect loop.
    const biz = await prisma.business.findUnique({
      where: { ownerId: session.user.id },
      select: { currency: true },
    });
    if (!biz) redirect("/onboarding");
    currency = biz.currency ?? "USD";
  }

  return (
    <FlagsProvider flags={getFlags()}>
      <CurrencyProvider currency={currency}>{children}</CurrencyProvider>
    </FlagsProvider>
  );
}
