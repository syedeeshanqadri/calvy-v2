import { prisma } from "@/lib/prisma";
import { redactSecrets } from "@/lib/admin/redact";

/** "ri***@mail.com": enough to recognise a recipient in the delivery log, never the full address. */
export function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return "•••";
  return `${u.slice(0, 2)}***@${d}`;
}

/** Everything the admin business page shows. No bank, PAN, gateway or credential values; customers appear by first name only. */
export async function loadBusinessDetail(id: string) {
  const b = await prisma.business.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true, emailVerified: true, createdAt: true } },
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" }, take: 30, select: { id: true, name: true, price: true, duration: true } },
      _count: { select: { appointments: true, clients: true, staff: true } },
    },
  });
  if (!b) return null;
  const safe = redactSecrets(b as unknown as Record<string, unknown>) as unknown as typeof b;

  const [team, bookings, deliveries, adminAudit, ownerAudit] = await Promise.all([
    prisma.teamMember.findMany({ where: { businessId: id }, select: { name: true, email: true, roleName: true, userId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.appointment.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, date: true, status: true, price: true, paymentStatus: true, createdAt: true, service: { select: { name: true } }, client: { select: { name: true } } } }),
    prisma.notificationOutbox.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, event: true, template: true, channel: true, status: true, error: true, recipient: true, createdAt: true } }),
    prisma.adminAuditLog.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, adminEmail: true, reason: true, createdAt: true } }),
    prisma.auditLog.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, actorId: true, target: true, createdAt: true } }),
  ]);
  return {
    business: { id: b.id, name: b.name, slug: b.slug, packId: b.packId, region: b.region, currency: b.currency, timezone: b.timezone, phone: b.phone, email: b.email, address: b.address, website: b.website, description: b.description, createdAt: b.createdAt, onboardingCompletedAt: b.onboardingCompletedAt, onboardingStep: b.onboardingStep, suspendedAt: b.suspendedAt, suspendedReason: b.suspendedReason, plan: b.plan, planStatus: b.planStatus, planOverridePlan: b.planOverridePlan, planOverrideUntil: b.planOverrideUntil, planOverrideFromPlan: b.planOverrideFromPlan, bookingMode: b.bookingMode, onlinePayMode: b.onlinePayMode, feePayer: b.feePayer, routeStatus: (safe as { routeStatus?: string }).routeStatus ?? null },
    owner: b.owner,
    counts: b._count,
    services: b.services,
    team,
    bookings: bookings.map((a) => ({ id: a.id, date: a.date, status: a.status, price: a.price, paymentStatus: a.paymentStatus, createdAt: a.createdAt, service: a.service.name, client: a.client.name.split(" ")[0] })),
    deliveries: deliveries.map((d) => ({ ...d, recipient: d.recipient.includes("@") ? maskEmail(d.recipient) : "•••" + d.recipient.slice(-3) })),
    adminAudit,
    ownerAudit,
  };
}
