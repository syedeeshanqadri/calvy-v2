import { whatsappOffered } from "@/lib/whatsapp/consent";
import { Unavailable } from "@/components/site/Unavailable";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getPayConfig } from "@/lib/onlinePayment";
import { contactRequirements } from "@/lib/patients";
import { parseSocialLinks, safeReviewLink } from "@/lib/brandLinks";
import { followUpFromQuery } from "@/lib/followUpDb";
import { oauthEnabled } from "@/lib/auth";
import { usesTenantSubdomains } from "@/lib/siteBase";
import { publicOffers } from "@/lib/offers/service";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { BookingClient } from "@/components/booking/BookingClient";
import { headers } from "next/headers";
import { siteBase } from "@/lib/siteBase";
import { showCalvyBadge } from "@/lib/calvyBadge";
import { calvyBadgeUrl } from "@/lib/calvyBadgeUrl";
import { siteFontClasses } from "@/app/[slug]/fonts";

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

export async function generateMetadata(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await props.params;
  const business = await getBusiness(params.slug);
  if (!business) return { title: "Not Found" };
  return {
    ...(business.logoUrl ? { icons: { icon: business.logoUrl } } : {}),
    title: `Book an appointment — ${business.name}`,
    alternates: { canonical: `/${business.slug}/book` },
    description: `Book your appointment with ${business.name} online. Choose your service, pick a time, and confirm instantly.`,
  };
}

export default async function BookNowPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.params;
  const host = (await headers()).get("host");
  const business = await getBusiness(params.slug);
  if (!business) notFound();
  if (business.suspendedAt) return <Unavailable name={business.name} />;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io";
  const data = {
    slug: business.slug,
    name: business.name,
    primaryColor: business.primaryColor,
    showCalvyBadge: await showCalvyBadge(business.id, business.websiteJson),
    calvyHref: calvyBadgeUrl(business.slug),
    logoUrl: business.logoUrl,
    socialLinks: parseSocialLinks(business.socialLinks),
    googleReviewUrl: safeReviewLink(business.googleReviewUrl),
    businessType: business.businessType,
    packId: business.packId,
    bookingMode: business.bookingMode,
    phoneRequired: contactRequirements(business.currency).phone,
    whatsappOffered: await whatsappOffered(business.id),
    payConfig: await getPayConfig(business),
    offers: await publicOffers(prisma, business.id, (await getBusinessFeatures(business.id)).offers),
    memberGoogleHref: oauthEnabled.google ? `${usesTenantSubdomains(root) ? `https://${root}` : ""}/account/member?business=${encodeURIComponent(business.slug)}` : null,
    termsOverride: business.termsOverride,
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
      mode: s.mode,
    })),
    staff: business.staff.map(s => ({
      id: s.id, name: s.name, role: s.role, color: s.color,
      serviceIds: s.services.map(l => l.serviceId),
    })),
  };

  const homeHref = siteBase(host, business.slug, process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io") || "/";
  return <BookingClient followUp={await followUpFromQuery((await props.searchParams).followUp, business)} business={data} fontClasses={await siteFontClasses(business.packId)} homeHref={homeHref} />;
}
