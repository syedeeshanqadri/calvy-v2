import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { PackId } from "@prisma/client";

const prisma = new PrismaClient();

const WH = JSON.stringify({
  monday:    { start: "09:00", end: "18:00", isWorking: true },
  tuesday:   { start: "09:00", end: "18:00", isWorking: true },
  wednesday: { start: "09:00", end: "18:00", isWorking: true },
  thursday:  { start: "09:00", end: "18:00", isWorking: true },
  friday:    { start: "09:00", end: "17:00", isWorking: true },
  saturday:  { start: "10:00", end: "15:00", isWorking: true },
  sunday:    { isWorking: false },
});

// Shared password for all dev-only test accounts (printed at the end of the run).
const TEST_PASSWORD = process.env.TEST_PASSWORD || "CalvyDev#2026";

// The test accounts include a super admin with a known password, so they are never created in production.
const TEST_ACCOUNTS_ENABLED = process.env.NODE_ENV !== "production" || process.env.SEED_TEST_ACCOUNTS === "1";

// Idempotent: upserts by unique email/slug, safe to run repeatedly. Runs even if demo data exists.
async function seedTestAccounts() {
  if (!TEST_ACCOUNTS_ENABLED) {
    console.log("Skipping test accounts (NODE_ENV=production; set SEED_TEST_ACCOUNTS=1 to override).");
    return;
  }
  const password = await bcrypt.hash(TEST_PASSWORD, 12);

  // Super admin: the app treats role === "admin" as admin (lib/adminAuth.ts), no env var needed.
  await prisma.user.upsert({
    where: { email: "admin@calvy.test" },
    update: { role: "admin", emailVerified: new Date() },
    create: { name: "Test Admin", email: "admin@calvy.test", password, role: "admin", emailVerified: new Date() },
  });

  // Verified owner with NO business: lands on /onboarding.
  await prisma.user.upsert({
    where: { email: "newowner@calvy.test" },
    update: { emailVerified: new Date() },
    create: { name: "New Owner", email: "newowner@calvy.test", password, emailVerified: new Date() },
  });

  const posts = [
    {
      slug: "test-how-to-reduce-no-shows",
      title: "How to Reduce No-Shows at Your Appointment Business",
      excerpt: "Practical ways to cut missed appointments with reminders and deposits.",
      tags: "no-shows,reminders",
      content: [
        "# How to Reduce No-Shows", "",
        "No-shows cost service businesses real money.", "",
        "## Send reminders", "",
        "Automated email and WhatsApp reminders cut no-shows sharply.", "",
        "## Take deposits", "",
        "Prepaid bookings make clients commit.",
      ].join("\n"),
    },
    {
      slug: "test-setting-up-online-booking",
      title: "Setting Up Online Booking in Under an Hour",
      excerpt: "A step-by-step checklist for launching your booking page.",
      tags: "booking,getting-started",
      content: [
        "# Setting Up Online Booking", "",
        "A quick checklist.", "",
        "1. Add your services", "2. Add your staff", "3. Share your booking link",
      ].join("\n"),
    },
  ];
  for (const p of posts) {
    await prisma.post.upsert({
      where: { slug: p.slug },
      update: { published: true },
      create: { ...p, authorName: "Calvy Team", published: true, publishedAt: new Date() },
    });
  }
}

async function main() {
  console.log("🌱 Seeding database...");

  await seedTestAccounts();

  const password = await bcrypt.hash("password123", 12);

  // Demo user + business
  const user = await prisma.user.upsert({
    where: { email: "demo@calvy.io" },
    update: {},
    create: { name: "Alex Johnson", email: "demo@calvy.io", password, emailVerified: new Date() },
  });

  // "Hair Salon" is not an id packForBusinessType() knows, so the pack is set explicitly.
  const demoFields = {
    businessType: "Hair Salon",
    packId: "SALON_SPA" as PackId,
    plan: "professional",
    planStatus: "active",
  };

  const existingBusiness = await prisma.business.findUnique({ where: { ownerId: user.id } });
  if (existingBusiness) {
    await prisma.business.update({ where: { id: existingBusiness.id }, data: demoFields });
    console.log("✅ Demo data already exists — refreshed type/pack/plan, skipping the rest.");
    await seedPackBusinesses();
    printSummary();
    return;
  }

  const business = await prisma.business.create({
    data: {
      name: "Alex Johnson Studio",
      slug: "alex-johnson-studio",
      ...demoFields,
      ownerId: user.id,
      description: "Premium hair and wellness studio",
    },
  });

  // Services
  const [s1, s2, s3, s4, s5, s6] = await Promise.all([
    prisma.service.create({ data: { businessId: business.id, name: "Haircut & Style",    description: "Full haircut with wash and blow dry",        duration: 60,  price: 85,  category: "haircare",   color: "#e84545", isActive: true } }),
    prisma.service.create({ data: { businessId: business.id, name: "Consultation",       description: "One-on-one consultation session",            duration: 30,  price: 60,  category: "consulting", color: "#3b82f6", isActive: true } }),
    prisma.service.create({ data: { businessId: business.id, name: "Full Session",       description: "Complete wellness or therapy session",       duration: 90,  price: 120, category: "wellness",   color: "#22c55e", isActive: true } }),
    prisma.service.create({ data: { businessId: business.id, name: "Follow-up",          description: "Short follow-up appointment",                duration: 30,  price: 45,  category: "consulting", color: "#f59e0b", isActive: true } }),
    prisma.service.create({ data: { businessId: business.id, name: "Premium Package",    description: "Extended premium service package",           duration: 120, price: 150, category: "wellness",   color: "#8b5cf6", isActive: true } }),
    prisma.service.create({ data: { businessId: business.id, name: "Color Treatment",    description: "Hair coloring and treatment",                duration: 120, price: 140, category: "haircare",   color: "#ec4899", isActive: true } }),
  ]);

  // Staff
  const [st1, st2, st3] = await Promise.all([
    prisma.staff.create({ data: { businessId: business.id, name: "Alex Johnson", role: "Senior Stylist",     email: "alex@calvy.io",   color: "#e84545", isActive: true, workingHours: WH } }),
    prisma.staff.create({ data: { businessId: business.id, name: "Jordan Kim",   role: "Color Specialist",   email: "jordan@calvy.io", color: "#3b82f6", isActive: true, workingHours: WH } }),
    prisma.staff.create({ data: { businessId: business.id, name: "Maya Patel",   role: "Wellness Therapist", email: "maya@calvy.io",   color: "#8b5cf6", isActive: true, workingHours: WH } }),
  ]);

  // Staff ↔ Service links
  await prisma.staffService.createMany({
    data: [
      { staffId: st1.id, serviceId: s1.id }, { staffId: st1.id, serviceId: s2.id },
      { staffId: st1.id, serviceId: s4.id }, { staffId: st1.id, serviceId: s5.id },
      { staffId: st2.id, serviceId: s1.id }, { staffId: st2.id, serviceId: s3.id },
      { staffId: st2.id, serviceId: s4.id }, { staffId: st2.id, serviceId: s6.id },
      { staffId: st3.id, serviceId: s2.id }, { staffId: st3.id, serviceId: s3.id },
      { staffId: st3.id, serviceId: s4.id },
    ],
  });

  // Clients
  const clientData = [
    { name: "Sarah Richardson", email: "sarah@email.com",   phone: "+1 555-1001" },
    { name: "Michael Kim",      email: "michael@email.com", phone: "+1 555-1002" },
    { name: "Ana López",        email: "ana@email.com",     phone: "+1 555-1003" },
    { name: "James Dawson",     email: "james@email.com",   phone: "+1 555-1004" },
    { name: "Priya Thomas",     email: "priya@email.com",   phone: "+1 555-1005", notes: "VIP client" },
    { name: "David Chen",       email: "david@email.com",   phone: "+1 555-1006" },
    { name: "Emma Wilson",      email: "emma@email.com",    phone: "+1 555-1007" },
    { name: "Ryan Shaw",        email: "ryan@email.com",    phone: "+1 555-1008" },
  ];

  const clients = await Promise.all(
    clientData.map(c => prisma.client.create({ data: { businessId: business.id, ...c } }))
  );

  // Appointments — spread across today and next 7 days
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  function dt(daysOffset: number, hour: number, minute = 0) {
    const d = new Date(base);
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  const withEnd = <T extends { date: Date; duration: number }>(a: T) => ({ ...a, endAt: new Date(a.date.getTime() + a.duration * 60_000) });
  await prisma.appointment.createMany({
    data: [
      { businessId: business.id, clientId: clients[0].id, staffId: st1.id, serviceId: s1.id, date: dt(0, 10),     duration: 60,  price: 85,  status: "confirmed",  paymentStatus: "paid" },
      { businessId: business.id, clientId: clients[1].id, staffId: st1.id, serviceId: s2.id, date: dt(0, 11, 30), duration: 30,  price: 60,  status: "pending",    paymentStatus: "unpaid" },
      { businessId: business.id, clientId: clients[2].id, staffId: st2.id, serviceId: s3.id, date: dt(0, 13),     duration: 90,  price: 120, status: "confirmed",  paymentStatus: "paid" },
      { businessId: business.id, clientId: clients[3].id, staffId: st3.id, serviceId: s4.id, date: dt(0, 14, 30), duration: 30,  price: 45,  status: "confirmed",  paymentStatus: "paid" },
      { businessId: business.id, clientId: clients[4].id, staffId: st1.id, serviceId: s5.id, date: dt(0, 16),     duration: 120, price: 150, status: "confirmed",  paymentStatus: "paid" },
      { businessId: business.id, clientId: clients[5].id, staffId: st2.id, serviceId: s6.id, date: dt(0, 9),      duration: 120, price: 140, status: "completed",  paymentStatus: "paid" },
      { businessId: business.id, clientId: clients[6].id, staffId: st3.id, serviceId: s3.id, date: dt(1, 10),     duration: 90,  price: 120, status: "confirmed",  paymentStatus: "paid" },
      { businessId: business.id, clientId: clients[7].id, staffId: st2.id, serviceId: s1.id, date: dt(1, 14),     duration: 60,  price: 85,  status: "pending",    paymentStatus: "unpaid" },
    ].map(withEnd),
  });

  await seedPackBusinesses();
  console.log("✅ Seed complete!");
  printSummary();
}

// One demo business per pack (dev only, idempotent).
type Spec = {
  email: string; owner: string; name: string; slug: string; description: string;
  businessType: string; packId: PackId; currency: string;
  staff: { name: string; role: string; color: string }[];
  services: { name: string; description: string; duration: number; price: number; category: string; color: string }[];
  links: number[][]; // links[i] = indexes into services that staff[i] provides
};

const PACK_BUSINESSES: Spec[] = [
  {
    email: "clinic@calvy.test", owner: "Dr. Neha Rao", name: "City Care Clinic", slug: "city-care-clinic",
    description: "General practice and family medicine", businessType: "clinic", packId: "CLINIC", currency: "INR",
    staff: [
      { name: "Dr. Neha Rao", role: "General Physician", color: "#0ea5e9" },
      { name: "Dr. Arjun Mehta", role: "Pediatrician", color: "#22c55e" },
    ],
    services: [
      { name: "General Consultation", description: "Doctor consultation and prescription", duration: 20, price: 500, category: "consultation", color: "#0ea5e9" },
      { name: "Follow-up Consultation", description: "Review of an earlier visit", duration: 15, price: 300, category: "consultation", color: "#22c55e" },
      { name: "Child Health Check-up", description: "Growth, vaccination and wellness check", duration: 30, price: 700, category: "consultation", color: "#f59e0b" },
    ],
    links: [[0, 1], [0, 1, 2]],
  },
  {
    email: "lawyer@calvy.test", owner: "Rohan Sharma", name: "Sharma Legal Associates", slug: "sharma-legal-associates",
    description: "Family, property and corporate law", businessType: "lawyer", packId: "LAWYER", currency: "INR",
    staff: [
      { name: "Rohan Sharma", role: "Senior Advocate", color: "#6366f1" },
      { name: "Kavya Iyer", role: "Associate Advocate", color: "#ec4899" },
    ],
    services: [
      { name: "Initial Legal Consultation", description: "First meeting to review your matter", duration: 45, price: 2000, category: "legal", color: "#6366f1" },
      { name: "Document Review", description: "Contract or agreement review", duration: 60, price: 3500, category: "legal", color: "#ec4899" },
      { name: "Case Strategy Session", description: "Plan next steps for an ongoing case", duration: 60, price: 4000, category: "legal", color: "#f59e0b" },
    ],
    links: [[0, 1, 2], [0, 1]],
  },
  {
    email: "fitness@calvy.test", owner: "Vikram Singh", name: "FitZone Training", slug: "fitzone-training",
    description: "Personal training and group fitness", businessType: "fitness", packId: "FITNESS", currency: "INR",
    staff: [
      { name: "Vikram Singh", role: "Head Trainer", color: "#ef4444" },
      { name: "Anita Desai", role: "Yoga Instructor", color: "#14b8a6" },
    ],
    services: [
      { name: "Personal Training Session", description: "One-on-one workout with a trainer", duration: 60, price: 800, category: "training", color: "#ef4444" },
      { name: "Fitness Assessment", description: "Body metrics and goal setting", duration: 45, price: 500, category: "training", color: "#f59e0b" },
      { name: "Yoga Class", description: "Beginner-friendly yoga session", duration: 60, price: 400, category: "class", color: "#14b8a6" },
    ],
    links: [[0, 1], [1, 2]],
  },
  {
    email: "other@calvy.test", owner: "Sam Carter", name: "Bright Studio Services", slug: "bright-studio-services",
    description: "Creative studio and professional services", businessType: "general", packId: "OTHER", currency: "USD",
    staff: [
      { name: "Sam Carter", role: "Studio Lead", color: "#8b5cf6" },
      { name: "Lena Ortiz", role: "Specialist", color: "#f97316" },
    ],
    services: [
      { name: "Discovery Call", description: "Short intro call about your needs", duration: 30, price: 0, category: "general", color: "#8b5cf6" },
      { name: "Standard Session", description: "Standard one-hour service", duration: 60, price: 90, category: "general", color: "#f97316" },
      { name: "Extended Session", description: "Longer in-depth session", duration: 120, price: 160, category: "general", color: "#22c55e" },
    ],
    links: [[0, 1, 2], [1, 2]],
  },
];

// Idempotent: users/businesses are upserted by email/slug; staff and services are created only once.
async function seedPackBusinesses() {
  if (!TEST_ACCOUNTS_ENABLED) return;
  const password = await bcrypt.hash(TEST_PASSWORD, 12);
  for (const spec of PACK_BUSINESSES) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { emailVerified: new Date() },
      create: { name: spec.owner, email: spec.email, password, emailVerified: new Date() },
    });
    const fields = {
      businessType: spec.businessType, packId: spec.packId, currency: spec.currency,
      plan: "professional", planStatus: "active", description: spec.description,
    };
    const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });
    const business = existing
      ? await prisma.business.update({ where: { id: existing.id }, data: fields })
      : await prisma.business.create({ data: { name: spec.name, slug: spec.slug, ownerId: user.id, ...fields } });
    if ((await prisma.service.count({ where: { businessId: business.id } })) === 0) {
      const services: { id: string }[] = [];
      for (const sv of spec.services) services.push(await prisma.service.create({ data: { businessId: business.id, isActive: true, ...sv } }));
      const staff: { id: string }[] = [];
      for (const [i, st] of spec.staff.entries()) {
        staff.push(await prisma.staff.create({
          data: { businessId: business.id, isActive: true, workingHours: WH, email: `staff${i + 1}.${spec.slug}@calvy.test`, ...st },
        }));
      }
      await prisma.staffService.createMany({
        data: spec.links.flatMap((idxs, i) => idxs.map(j => ({ staffId: staff[i].id, serviceId: services[j].id }))),
        skipDuplicates: true,
      });
    }
    await seedPackAppointments(spec, business.id);
  }
}

// Clients and 5 appointments around today (today + tomorrow), only when the business has none yet.
async function seedPackAppointments(spec: Spec, businessId: string) {
  if ((await prisma.appointment.count({ where: { businessId } })) > 0) return;
  const services = await prisma.service.findMany({ where: { businessId, name: { in: spec.services.map(s => s.name) } } });
  const staff = await prisma.staff.findMany({ where: { businessId, email: { in: spec.staff.map((_, i) => `staff${i + 1}.${spec.slug}@calvy.test`) } } });
  const svc = (j: number) => services.find(s => s.name === spec.services[j].name)!;
  const stf = (i: number) => staff.find(s => s.email === `staff${i + 1}.${spec.slug}@calvy.test`)!;

  const clients: { id: string }[] = [];
  for (const [i, name] of ["Riya Kapoor", "Aman Verma", "Sofia Rossi"].entries()) {
    clients.push(await prisma.client.upsert({
      where: { businessId_email: { businessId, email: `client${i + 1}.${spec.slug}@example.com` } },
      update: {},
      create: { businessId, name, email: `client${i + 1}.${spec.slug}@example.com`, phone: `+91 98000 0${i + 1}${String(spec.slug.length).padStart(3, "0")}` },
    }));
  }

  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const at = (day: number, hour: number, minute = 0) => {
    const d = new Date(base);
    d.setDate(d.getDate() + day);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  // [client, staff, service (index into spec.services), day offset, hour, minute, status, paymentStatus]
  // Each staff member only gets services they are linked to (spec.links), at non-overlapping times.
  const [a0, a1] = [spec.links[0], spec.links[1]];
  const plan: [number, number, number, number, number, number, string, string][] = [
    [0, 0, a0[0], 0, 10, 0, "confirmed", "paid"],
    [1, 0, a0[1] ?? a0[0], 0, 14, 0, "pending", "unpaid"],
    [2, 1, a1[0], 0, 11, 30, "confirmed", "paid"],
    [0, 0, a0[0], 1, 11, 0, "confirmed", "unpaid"],
    [1, 1, a1[a1.length - 1], 1, 15, 0, "pending", "unpaid"],
  ];
  await prisma.appointment.createMany({
    data: plan.map(([c, st, sv, day, h, m, status, paymentStatus]) => {
      const service = svc(sv);
      const date = at(day, h, m);
      return {
        businessId, clientId: clients[c].id, staffId: stf(st).id, serviceId: service.id,
        date, duration: service.duration, price: service.price, status, paymentStatus,
        endAt: new Date(date.getTime() + service.duration * 60_000),
      };
    }),
  });
}

function printSummary() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log("   Demo owner:  demo@calvy.io / password123  (Alex Johnson Studio, SALON_SPA)");
  console.log(`   Book:        ${appUrl}/b/alex-johnson-studio`);
  if (!TEST_ACCOUNTS_ENABLED) return;
  console.log("   Test accounts (dev only), shared password: " + TEST_PASSWORD);
  console.log("     admin@calvy.test     (super admin)");
  console.log("     newowner@calvy.test  (verified, not onboarded)");
  for (const b of PACK_BUSINESSES) {
    console.log(`     ${b.email.padEnd(20)} ${b.name} [${b.packId}]  ${appUrl}/b/${b.slug}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
