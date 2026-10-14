import { prisma } from "@/lib/prisma";
import { defaultWebsiteConfig } from "@/lib/website";

function toBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export async function generateSlug(name: string): Promise<string> {
  const base = toBaseSlug(name) || "business";
  const exists = await prisma.business.findUnique({ where: { slug: base } });
  if (!exists) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    const taken = await prisma.business.findUnique({ where: { slug: candidate } });
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
 * Create a Business (with a default service + owner staff) for an existing user.
 * Shared by email/password signup and OAuth onboarding so both produce an
 * identical starter workspace.
 */
export async function createBusinessForUser(params: {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  currency: string;
  businessType?: string;
}) {
  const businessType = params.businessType ?? "general";
  const slug = await generateSlug(params.businessName);
  const websiteJson = JSON.stringify(defaultWebsiteConfig(params.businessName, businessType));

  return prisma.business.create({
    data: {
      name: params.businessName,
      slug,
      businessType,
      websiteJson,
      plan: "free",
      planStatus: "free",
      currency: params.currency,
      owner: { connect: { id: params.ownerId } },
      services: {
        create: [
          {
            name: "Consultation",
            description: "Initial consultation session",
            duration: 30,
            price: 50,
            category: "consulting",
            color: "#0284c7",
            isActive: true,
          },
        ],
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
  });
}
