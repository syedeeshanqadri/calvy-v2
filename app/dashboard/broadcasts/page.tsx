import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import BroadcastsClient from "./BroadcastsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  if (!getFlags().broadcasts) notFound();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const business = await prisma.business.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!business) redirect("/login");

  const features = await getBusinessFeatures(business.id);
  if (!features.broadcasts) {
    return (
      <UpgradeGate
        title="Broadcasts"
        subtitle="Send offers and updates to your clients"
        description="Send bulk emails and WhatsApp messages to your clients. Available on Starter, Professional, and Business plans."
      />
    );
  }

  const [clients, recentBroadcasts] = await Promise.all([
    prisma.client.findMany({
      where: { businessId: business.id },
      select: { email: true, phone: true },
    }),
    prisma.broadcast.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const emailCount = clients.filter(c => c.email).length;
  const whatsappCount = clients.filter(c => c.phone).length;

  return (
    <DashboardLayout title="Broadcasts" subtitle="Send offers and updates to your clients">
      <BroadcastsClient
        clientCount={clients.length}
        emailCount={emailCount}
        whatsappCount={whatsappCount}
        recentBroadcasts={recentBroadcasts}
      />
    </DashboardLayout>
  );
}
