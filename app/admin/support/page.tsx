import { getServerSession } from "next-auth";
import { isAdminUser } from "@/lib/adminAuth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { normalizePlanId } from "@/lib/plans";
import { AdminSupportClient } from "./AdminSupportClient";

export const dynamic = 'force-dynamic';

export default async function AdminSupportPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminUser(session?.user);
  if (!isAdmin) redirect("/login");

  const tickets = await prisma.supportTicket.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      business: {
        select: {
          name: true,
          plan: true,
          owner: { select: { email: true, name: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  // Plans with priority support are answered first; inside each group the newest activity leads.
  const priorityPlans = new Set(
    (await prisma.planConfig.findMany({ where: { prioritySupport: true }, select: { planId: true } })).map((p) => p.planId),
  );
  const rank = (t: (typeof tickets)[number]) => (priorityPlans.has(normalizePlanId(t.business.plan)) ? 0 : 1);
  tickets.sort((a, b) => rank(a) - rank(b));

  // Serialize dates for client component
  const serialized = JSON.parse(JSON.stringify(tickets));
  return <AdminSupportClient tickets={serialized} />;
}
