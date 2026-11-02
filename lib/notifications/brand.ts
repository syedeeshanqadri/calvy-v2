import { prisma } from "@/lib/prisma";
import { absoluteAssetUrl } from "@/lib/storage";
import { safeThemeColor, readableForeground } from "@/lib/theme";
import type { RenderBrand } from "@/lib/notifications/templates";

/** The look and wording of a business. A failed read throws, so the message is retried rather than sent unbranded. */
export async function loadBrand(businessId: string): Promise<RenderBrand | undefined> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, logoUrl: true, primaryColor: true, address: true, phone: true, packId: true, termsOverride: true },
  });
  if (!b) return undefined;
  const color = safeThemeColor(b.primaryColor);
  return {
    tenant: { name: b.name, logoUrl: absoluteAssetUrl(b.logoUrl), color, fg: readableForeground(color), address: b.address, phone: b.phone },
    terms: { packId: b.packId, termsOverride: b.termsOverride },
  };
}
