import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePlanId } from "@/lib/plans";
import { displayPlan } from "@/lib/pricingDisplay";
import { SUPPORT_EMAIL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Plan page. There are no online plan payments yet (Cashfree Subscriptions come in step 25): until then Calvy changes a
 * business's plan from the admin panel, and the owner asks support.
 */
export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");
  const business = await prisma.business.findUnique({ where: { id: session.user.businessId }, select: { plan: true } });
  if (!business) redirect("/login");
  const plan = normalizePlanId(business.plan);
  const name = displayPlan(plan)?.name ?? plan;
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a]">Your plan</h1>
      <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-2">
        <p className="text-sm text-[#6b6b80]">Current plan</p>
        <p className="font-syne font-bold text-xl text-[#0f0f1a]">{name}</p>
        <p className="text-sm text-[#6b6b80]">Plan changes are handled by our team for now. Email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or open the <Link className="underline" href="/dashboard/support">Support</Link> page and we will switch your plan.</p>
      </div>
    </div>
  );
}
