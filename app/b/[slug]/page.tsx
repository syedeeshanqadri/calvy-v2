import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BookingClient } from "./BookingClient";

export const dynamic = 'force-dynamic';

export default async function BusinessBookingPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const business = await prisma.business.findUnique({
    where: { slug: params.slug },
    include: {
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      staff: { where: { isActive: true }, orderBy: { createdAt: "asc" }, include: { services: { select: { serviceId: true } } } },
    },
  });

  if (!business) notFound();

  const data = {
    slug: business.slug,
    name: business.name,
    primaryColor: business.primaryColor,
    businessType: business.businessType,
    description: business.description ?? "",
    phone: business.phone ?? "",
    address: business.address ?? "",
    website: business.website ?? "",
    currency: business.currency ?? "USD",
    paymentMode: (business as { paymentMode?: string }).paymentMode ?? "prepaid",
    services: business.services.map(s => ({
      id: s.id, name: s.name, description: s.description,
      duration: s.duration, price: s.price, color: s.color,
      capacity: (s as { capacity?: number }).capacity ?? 1,
    })),
    staff: business.staff.map(s => ({
      id: s.id, name: s.name, role: s.role, color: s.color,
      serviceIds: s.services.map(l => l.serviceId),
    })),
  };

  return <BookingClient business={data} />;
}
