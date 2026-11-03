import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ServicesClient } from "./ServicesClient";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const [services, features] = await Promise.all([
    prisma.service.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { createdAt: "asc" },
    }),
    getBusinessFeatures(session.user.businessId),
  ]);

  const rows = services.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    duration: s.duration,
    price: s.price,
    color: s.color,
    category: s.category,
    isActive: s.isActive,
    capacity: (s as { capacity?: number }).capacity ?? 1,
    mode: s.mode,
    meetingUrl: s.meetingUrl ?? "",
    imageUrl: s.imageUrl ?? "",
  }));

  return <ServicesClient services={rows} groupBooking={features.groupBooking} />;
}
