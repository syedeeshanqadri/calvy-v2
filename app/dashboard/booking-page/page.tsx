import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { BookingPageClient } from "./BookingPageClient";

export const dynamic = 'force-dynamic';

export default async function BookingPagePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const [business, services] = await Promise.all([
    prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: { name: true, slug: true, primaryColor: true, description: true, currency: true },
    }),
    prisma.service.findMany({
      where: { businessId: session.user.businessId, isActive: true },
      select: { name: true, duration: true, price: true },
      take: 3,
    }),
  ]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io";
  const slug = business?.slug ?? session.user.businessSlug ?? "";
  const bookingUrl = `https://${slug}.${rootDomain}/book-now`;

  return (
    <BookingPageClient
      bookingUrl={bookingUrl}
      initialBusinessName={business?.name ?? "My Business"}
      initialColor={business?.primaryColor ?? "#0284c7"}
      initialDescription={business?.description ?? ""}
      currency={business?.currency ?? "INR"}
      services={services}
    />
  );
}
