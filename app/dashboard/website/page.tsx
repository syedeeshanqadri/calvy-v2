import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { WebsiteEditorClient } from "./WebsiteEditorClient";
import { parseSocialLinks } from "@/lib/brandLinks";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const [business, features] = await Promise.all([
    prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: { slug: true, name: true, businessType: true, websiteJson: true, packId: true, termsOverride: true, primaryColor: true, logoUrl: true, socialLinks: true, googleReviewUrl: true, timezone: true, currency: true,
        staff: { where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true, photoUrl: true, bio: true, specialisation: true } },
        services: { where: { isActive: true }, orderBy: { createdAt: "asc" }, take: 6, select: { id: true, name: true, description: true, duration: true, price: true, capacity: true, imageUrl: true, mode: true } } },
    }),
    getBusinessFeatures(session.user.businessId),
  ]);

  if (!business) redirect("/login");

  return (
    <WebsiteEditorClient
      slug={business.slug}
      businessName={business.name}
      businessType={business.businessType}
      terms={{ packId: business.packId, termsOverride: business.termsOverride }}
      websiteJson={business.websiteJson ?? "{}"}
      imageUpload={features.imageUpload}
      seoControls={features.seoControls}
      themeColor={business.primaryColor}
      logoUrl={business.logoUrl}
      socialLinks={parseSocialLinks(business.socialLinks)}
      googleReviewUrl={business.googleReviewUrl}
      packId={business.packId}
      timezone={business.timezone}
      currency={business.currency}
      staff={business.staff}
      services={business.services}
    />
  );
}
