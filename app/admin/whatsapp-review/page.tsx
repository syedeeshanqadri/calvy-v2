import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppReviewPage() {
  await requireAdminPage();
  const configs = await prisma.whatsAppConfig.findMany({ where: { status: "CONNECTED" }, select: { businessId: true, wabaId: true, displayPhone: true, source: true }, orderBy: { updatedAt: "desc" }, take: 50 });
  const names = await prisma.business.findMany({ where: { id: { in: configs.map((c) => c.businessId) } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((b) => [b.id, b.name]));
  return <ReviewClient connections={configs.map((c) => ({ businessId: c.businessId, business: nameOf.get(c.businessId) ?? c.businessId, wabaId: c.wabaId, number: c.displayPhone, source: c.source }))} />;
}
