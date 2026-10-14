import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { WebsiteEditorClient } from "./WebsiteEditorClient";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const [business, features] = await Promise.all([
    prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: { slug: true, name: true, businessType: true, websiteJson: true },
    }),
    getBusinessFeatures(session.user.businessId),
  ]);

  if (!business) redirect("/login");

  return (
    <WebsiteEditorClient
      slug={business.slug}
      businessName={business.name}
      businessType={business.businessType}
      websiteJson={business.websiteJson ?? "{}"}
      imageUpload={features.imageUpload}
      seoControls={features.seoControls}
    />
  );
}
