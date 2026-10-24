import { prisma } from "@/lib/prisma";
import { defaultWebsiteConfig } from "@/lib/website";
import { isReservedSlug } from "@/lib/slugs";
import { safeTimeZone } from "@/lib/time";
import { syncBusinessHours } from "@/lib/schedule";
import { getPack, type PackId } from "@/lib/packs";

function toBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export async function generateSlug(name: string): Promise<string> {
  const base = toBaseSlug(name) || "business";
  // A reserved word (e.g. "Admin") is never used bare; it falls through to "admin-2".
  const exists = isReservedSlug(base) || (await prisma.business.findUnique({ where: { slug: base } }));
  if (!exists) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    const taken = isReservedSlug(candidate) || (await prisma.business.findUnique({ where: { slug: candidate } }));
    if (!taken) return candidate;
  }
  return `${base}-${Date.now()}`;
}

const DEFAULT_WORKING_HOURS = JSON.stringify({
  monday: { start: "09:00", end: "18:00", isWorking: true },
  tuesday: { start: "09:00", end: "18:00", isWorking: true },
  wednesday: { start: "09:00", end: "18:00", isWorking: true },
  thursday: { start: "09:00", end: "18:00", isWorking: true },
  friday: { start: "09:00", end: "17:00", isWorking: true },
  saturday: { start: "10:00", end: "14:00", isWorking: true },
  sunday: { isWorking: false },
});

/**
 * Create a Business (with the pack's default services + owner staff) for an existing user.
 * Shared by email/password signup and OAuth onboarding so both produce an
 * identical starter workspace.
 */
export async function createBusinessForUser(params: {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  currency: string;
  timezone?: string;
  businessType?: string;
  /** Business pack; sets the wording, default services and legacy businessType. Defaults to OTHER. */
  packId?: PackId;
}) {
  const pack = getPack(params.packId);
  const businessType = params.businessType ?? pack.businessType;
  const slug = await generateSlug(params.businessName);
  const websiteJson = JSON.stringify(defaultWebsiteConfig(params.businessName, businessType, { packId: pack.id }));

  const business = await prisma.business.create({
    data: {
      name: params.businessName,
      slug,
      businessType,
      packId: pack.id,
      bookingMode: pack.defaultBookingMode,
      websiteJson,
      plan: "free",
      planStatus: "free",
      currency: params.currency,
      timezone: safeTimeZone(params.timezone),
      owner: { connect: { id: params.ownerId } },
      services: {
        create: pack.defaultServices.map((svc) => ({ ...svc, isActive: true })),
      },
      staff: {
        create: [
          {
            name: params.ownerName,
            role: "Owner",
            email: params.ownerEmail,
            color: "#0284c7",
            isActive: true,
            workingHours: DEFAULT_WORKING_HOURS,
          },
        ],
      },
    },
    include: { staff: { select: { id: true } }, services: { select: { id: true } } },
  });
  await syncBusinessHours(prisma, business.id, "{}");
  await prisma.staffService.createMany({
    data: business.staff.flatMap((st) => business.services.map((sv) => ({ staffId: st.id, serviceId: sv.id }))),
    skipDuplicates: true,
  });
  return business;
}
