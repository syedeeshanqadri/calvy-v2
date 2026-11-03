import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPack } from "@/lib/packs";
import { defaultWebsiteConfig } from "@/lib/website";
import { safeTimeZone } from "@/lib/time";
import { syncBusinessHours, linkServiceToAllStaff } from "@/lib/schedule";
import { getLimitsFromDB } from "@/lib/plans";
import { createBusinessForUser } from "@/lib/createBusiness";
import { notify } from "@/lib/notifications/enqueue";
import { ownerLive } from "@/lib/notifications/business";
import { logger } from "@/lib/logger";
import { LAST_STEP, STEPS, currencyFor, stepSchemas, hoursToJson, type SavableStep } from "@/lib/onboarding";
import { validateSlug } from "@/lib/slugs";
import type { z } from "zod";

export class SlugTakenError extends Error {
  constructor() { super("That address is already taken."); }
}

/** Is this slug free for this business (its own current slug counts as free)? Format must already be valid. */
export async function slugAvailable(slug: string, businessId: string | null): Promise<boolean> {
  const row = await prisma.business.findUnique({ where: { slug }, select: { id: true } });
  return !row || row.id === businessId;
}

export async function checkSlug(raw: string, businessId: string | null): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const v = validateSlug(raw);
  if (!v.ok) return v;
  if (!(await slugAvailable(v.slug, businessId))) return { ok: false, error: "That address is already taken." };
  return v;
}

/** The owner's business, created as an unfinished draft the first time (Google sign-ups have none yet). */
export async function getOrCreateDraft(user: { id: string; name: string; email: string }) {
  const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });
  if (existing) return existing;
  const first = user.name.trim().split(/\s+/)[0] || "My";
  try {
    return await createBusinessForUser({
      ownerId: user.id, ownerName: user.name, ownerEmail: user.email,
      businessName: `${first}'s Business`, currency: "USD", region: "INTL",
    });
  } catch (err) {
    // A parallel request won the race for the one-business-per-owner rule.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.business.findUnique({ where: { ownerId: user.id } });
      if (again) return again;
    }
    throw err;
  }
}

export async function loadWizardState(businessId: string) {
  const b = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: { services: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
  });
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  return {
    step: b.onboardingCompletedAt ? LAST_STEP : Math.min(LAST_STEP, Math.max(1, b.onboardingStep)),
    completed: !!b.onboardingCompletedAt,
    region: (b.region === "IN" ? "IN" : "INTL") as "IN" | "INTL",
    currency: b.currency,
    packId: b.packId,
    name: b.name,
    slug: b.slug,
    timezone: b.timezone,
    phone: b.phone ?? "",
    address: b.address ?? "",
    bookingMode: b.bookingMode,
    intendedPlan: (["professional", "business"].includes(b.intendedPlan ?? "") ? b.intendedPlan : "free") as "free" | "professional" | "business",
    availabilityJson: b.availabilityJson,
    services: b.services.map((s) => ({ id: s.id, name: s.name, duration: s.duration, price: s.price })),
    rootDomain: root ?? null,
  };
}

type Input<S extends SavableStep> = z.infer<(typeof stepSchemas)[S]>;

async function replaceServicesWithPack(tx: Prisma.TransactionClient, businessId: string, packId: Input<"type">["packId"]) {
  // Only while the workspace is brand new: never throw away a service somebody already booked.
  const booked = await tx.appointment.count({ where: { businessId } });
  if (booked > 0) return;
  await tx.service.deleteMany({ where: { businessId } });
  for (const svc of getPack(packId).defaultServices) {
    const created = await tx.service.create({ data: { ...svc, businessId, isActive: true } });
    await linkServiceToAllStaff(tx, businessId, created.id);
  }
}

/** Save one wizard step. `data` must already be validated with the step's schema. Progress only moves forward. */
export async function saveStep<S extends SavableStep>(businessId: string, step: S, data: Input<S>): Promise<void> {
  const idx = STEPS.indexOf(step) + 1;
  const advance = { onboardingStep: Math.min(LAST_STEP, idx + 1) };

  await prisma.$transaction(async (tx) => {
    const cur = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { onboardingStep: true, packId: true, onboardingCompletedAt: true } });
    const next = { onboardingStep: Math.max(cur.onboardingStep, advance.onboardingStep) };

    if (step === "region") {
      const d = data as Input<"region">;
      await tx.business.update({ where: { id: businessId }, data: { region: d.region, currency: currencyFor(d.region, d.country), ...next } });
    } else if (step === "type") {
      const d = data as Input<"type">;
      const pack = getPack(d.packId);
      await tx.business.update({ where: { id: businessId }, data: { packId: pack.id, businessType: pack.businessType, bookingMode: pack.defaultBookingMode, ...next } });
      if (cur.packId !== pack.id) await replaceServicesWithPack(tx, businessId, pack.id);
    } else if (step === "basics") {
      const d = data as Input<"basics">;
      try {
        await tx.business.update({
          where: { id: businessId },
          data: { name: d.name, slug: d.slug, timezone: safeTimeZone(d.timezone), phone: d.phone ?? null, address: d.address ?? null, ...next },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new SlugTakenError();
        throw err;
      }
    } else if (step === "mode") {
      const d = data as Input<"mode">;
      await tx.business.update({ where: { id: businessId }, data: { bookingMode: d.bookingMode, ...next } });
    } else if (step === "services") {
      const d = data as Input<"services">;
      const max = (await getLimitsFromDB("free")).maxServices;
      if (max !== -1 && d.services.length > max) throw new Error(`The Free plan includes ${max} services. You can add more after upgrading.`);
      if (d.services.length === 0) throw new Error("Add at least one service so customers can book.");
      const pack = getPack(cur.packId);
      const existing = await tx.service.findMany({ where: { businessId, isActive: true }, select: { id: true } });
      const keep = new Set(d.services.map((s) => s.id).filter(Boolean));
      for (const e of existing) {
        if (keep.has(e.id)) continue;
        const booked = await tx.appointment.count({ where: { serviceId: e.id } });
        if (booked > 0) await tx.service.update({ where: { id: e.id }, data: { isActive: false } });
        else await tx.service.delete({ where: { id: e.id } });
      }
      const mine = new Set(existing.map((e) => e.id));
      const base = pack.defaultServices[0];
      for (const s of d.services) {
        if (s.id && mine.has(s.id)) {
          await tx.service.update({ where: { id: s.id }, data: { name: s.name, duration: s.duration, price: s.price } });
        } else {
          const created = await tx.service.create({
            data: { businessId, name: s.name, duration: s.duration, price: s.price, description: "", category: base?.category ?? "General", color: base?.color ?? "#0284c7", isActive: true },
          });
          await linkServiceToAllStaff(tx, businessId, created.id);
        }
      }
      await tx.business.update({ where: { id: businessId }, data: next });
    } else if (step === "hours") {
      const d = data as Input<"hours">;
      const json = hoursToJson(d.hours);
      await tx.business.update({ where: { id: businessId }, data: { availabilityJson: json, ...next } });
      await syncBusinessHours(tx, businessId, json);
    } else if (step === "plan") {
      const d = data as Input<"plan">;
      await tx.business.update({ where: { id: businessId }, data: { intendedPlan: d.plan, ...next } });
    }
  });
}

/** Skip: keep the defaults and move on. */
export async function skipStep(businessId: string, step: SavableStep): Promise<void> {
  const idx = STEPS.indexOf(step) + 1;
  await prisma.business.updateMany({
    where: { id: businessId, onboardingStep: { lte: idx } },
    data: { onboardingStep: Math.min(LAST_STEP, idx + 1) },
  });
}

/**
 * Finish the wizard. The claim is one atomic UPDATE ... WHERE onboardingCompletedAt IS NULL, so the
 * "business is live" email goes out exactly once even if the button is double-clicked or retried.
 */
export async function completeOnboarding(businessId: string, owner: { name: string; email: string }): Promise<{ firstTime: boolean; slug: string }> {
  const claimed = await prisma.business.updateMany({
    where: { id: businessId, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date(), onboardingStep: LAST_STEP },
  });
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true, slug: true, businessType: true, packId: true } });
  if (claimed.count === 1) {
    // Rebuild the site copy now that name, type and pack are final.
    await prisma.business.update({ where: { id: businessId }, data: { websiteJson: JSON.stringify(defaultWebsiteConfig(b.name, b.businessType, { packId: b.packId })) } });
    try {
      await notify(ownerLive({ businessId, slug: b.slug, businessName: b.name, ownerName: owner.name, ownerEmail: owner.email }));
    } catch (err) {
      logger.error("[onboarding] business-live email not queued", { err });
    }
  }
  return { firstTime: claimed.count === 1, slug: b.slug };
}
