import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { SupportClient } from "./SupportClient";

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const businessId = session.user.businessId;

  const tickets = await prisma.supportTicket.findMany({
    where: { businessId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });

  const serialized = JSON.parse(JSON.stringify(tickets));
  return (
    <DashboardLayout title="Support" subtitle="Get help from our team">
      <SupportClient tickets={serialized} />
    </DashboardLayout>
  );
}
