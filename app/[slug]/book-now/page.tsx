import { notFound } from "next/navigation";
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { BookingClient } from "@/app/b/[slug]/BookingClient";

export const dynamic = "force-dynamic";

async function getBusiness(slug: string) {
  return prisma.business.findUnique({
    where: { slug },
    include: {
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      staff: { where: { isActive: true }, orderBy: { createdAt: "asc" }, include: { services: { select: { serviceId: true } } } },
    },
  });
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const business = await getBusiness(params.slug);
  if (!business) return { title: "Not Found" };
  return {
    title: `Book an appointment — ${business.name}`,
    description: `Book your appointment with ${business.name} online. Choose your service, pick a time, and confirm instantly.`,
  };
}

export default async function BookNowPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const business = await getBusiness(params.slug);
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
