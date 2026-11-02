// Extra rows the Playwright smoke suite needs on top of `prisma db seed`: a verified customer account
// and an online-only consultation service on the demo salon. Idempotent; test databases only (CI or dev).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const E2E_CUSTOMER_EMAIL = "e2e-customer@calvy.test";
const PASSWORD = process.env.TEST_PASSWORD || "CalvyDev#2026";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("e2e fixtures are for throwaway test databases only.");
  }
  await prisma.customer.upsert({
    where: { email: E2E_CUSTOMER_EMAIL },
    update: { emailVerified: new Date(), password: await bcrypt.hash(PASSWORD, 12) },
    create: { name: "E2E Customer", email: E2E_CUSTOMER_EMAIL, password: await bcrypt.hash(PASSWORD, 12), emailVerified: new Date() },
  });

  const business = await prisma.business.findUnique({ where: { slug: "alex-johnson-studio" } });
  if (!business) throw new Error("Demo salon not found: run `npm run db:seed` first.");
  // The demo salon takes slot bookings (the seed default); a hand-edited database may have switched it to queue mode.
  await prisma.business.update({ where: { id: business.id }, data: { bookingMode: "SLOT" } });
  const existing = await prisma.service.findFirst({ where: { businessId: business.id, name: "Online Consultation" } });
  if (!existing) {
    const service = await prisma.service.create({
      data: {
        businessId: business.id, name: "Online Consultation", description: "Video call", duration: 30, price: 0,
        category: "consultation", mode: "ONLINE", meetingUrl: "https://meet.example.com/e2e-room", isActive: true,
      },
    });
    const staff = await prisma.staff.findMany({ where: { businessId: business.id, isActive: true } });
    for (const s of staff) await prisma.staffService.create({ data: { staffId: s.id, serviceId: service.id } });
  }
  console.log("e2e fixtures ready");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
