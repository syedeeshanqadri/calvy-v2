// Seeds the demo businesses whose real screens appear on the marketing site (npm run marketing:demo). DEV DATABASE ONLY.
// Two regions x two businesses: India (INR, Indian names) and International (USD, international names), each with a
// clinic (token queue) and a salon (time slots). Re-running wipes and recreates them, so "today" is always today.
//   Logins (shared password TEST_PASSWORD, default CalvyDev#2026): marketing-{clinic,salon}-{in,intl}@calvy.test
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createBusinessForUser } from "../lib/createBusiness";
import { utcToZoned, zonedToUtc } from "../lib/time";

const prisma = new PrismaClient();
const PASSWORD = process.env.TEST_PASSWORD ?? "CalvyDev#2026";

type Svc = { name: string; duration: number; price: number; category?: string };
interface Spec {
  key: string; region: "IN" | "INTL"; kind: "clinic" | "salon"; businessName: string; owner: string; currency: "INR" | "USD"; tz: string;
  pack: "CLINIC" | "SALON_SPA"; staff: string[]; services: Svc[]; patients: string[]; phone: string;
}

const SPECS: Spec[] = [
  { key: "clinic-in", region: "IN", kind: "clinic", businessName: "Sharma Family Clinic", owner: "Dr. Anita Sharma", currency: "INR", tz: "Asia/Kolkata", pack: "CLINIC", phone: "+91 98765 43210",
    staff: ["Dr. Rohit Verma"], services: [{ name: "General Consultation", duration: 15, price: 500 }, { name: "Follow-up Visit", duration: 10, price: 300 }, { name: "Child Health Check", duration: 20, price: 600 }, { name: "Online Consultation", duration: 15, price: 400 }],
    patients: ["Priya Nair", "Mohammed Iqbal", "Kavita Joshi", "Suresh Reddy", "Anjali Mehta", "Arjun Singh", "Neha Gupta", "Vikram Patel"] },
  { key: "salon-in", region: "IN", kind: "salon", businessName: "Glow & Co Salon", owner: "Meera Kapoor", currency: "INR", tz: "Asia/Kolkata", pack: "SALON_SPA", phone: "+91 98100 22334",
    staff: ["Sana Khan", "Aditi Rao"], services: [{ name: "Haircut & Style", duration: 45, price: 600 }, { name: "Hair Colour", duration: 90, price: 2500 }, { name: "Facial", duration: 60, price: 1200 }, { name: "Manicure", duration: 30, price: 500 }],
    patients: ["Riya Malhotra", "Pooja Iyer", "Fatima Sheikh", "Ananya Das", "Simran Kaur", "Divya Menon"] },
  { key: "clinic-intl", region: "INTL", kind: "clinic", businessName: "Riverside Family Clinic", owner: "Dr. Sarah Mitchell", currency: "USD", tz: "America/New_York", pack: "CLINIC", phone: "+1 212 555 0148",
    staff: ["Dr. James Carter"], services: [{ name: "General Consultation", duration: 15, price: 90 }, { name: "Follow-up Visit", duration: 10, price: 60 }, { name: "Child Health Check", duration: 20, price: 110 }, { name: "Online Consultation", duration: 15, price: 75 }],
    patients: ["Emily Watson", "Aisha Khan", "Carlos Mendez", "Daniel Brooks", "Olivia Martin", "Noah Williams", "Mia Rodriguez", "Liam O'Connor"] },
  { key: "salon-intl", region: "INTL", kind: "salon", businessName: "Oak & Thread Studio", owner: "Emma Collins", currency: "USD", tz: "America/New_York", pack: "SALON_SPA", phone: "+1 212 555 0172",
    staff: ["Carlos Ortiz", "Sophie Turner"], services: [{ name: "Haircut & Style", duration: 45, price: 55 }, { name: "Hair Colour", duration: 90, price: 160 }, { name: "Facial", duration: 60, price: 85 }, { name: "Manicure", duration: 30, price: 40 }],
    patients: ["Jessica Taylor", "Aisha Rahman", "Michael Reed", "Sarah Johnson", "Priya Shah", "Tom Anderson"] },
];

const HOURS = JSON.stringify({
  monday: { start: "09:00", end: "19:00", isWorking: true }, tuesday: { start: "09:00", end: "19:00", isWorking: true }, wednesday: { start: "09:00", end: "19:00", isWorking: true },
  thursday: { start: "09:00", end: "19:00", isWorking: true }, friday: { start: "09:00", end: "19:00", isWorking: true }, saturday: { start: "10:00", end: "16:00", isWorking: true }, sunday: { isWorking: false },
});

async function wipe() {
  const emails = SPECS.map((s) => `marketing-${s.key}@calvy.test`);
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  for (const u of users) {
    await prisma.business.deleteMany({ where: { ownerId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
}

async function seed(spec: Spec, hash: string) {
  const email = `marketing-${spec.key}@calvy.test`;
  const user = await prisma.user.create({ data: { name: spec.owner, email, password: hash, emailVerified: new Date() } });
  const b = await createBusinessForUser({ ownerId: user.id, ownerName: spec.owner, ownerEmail: email, businessName: spec.businessName, currency: spec.currency, timezone: spec.tz, packId: spec.pack, region: spec.region, phone: spec.phone, welcome: false });
  // Own services and team instead of the pack defaults.
  await prisma.staffService.deleteMany({ where: { staff: { businessId: b.id } } });
  await prisma.service.deleteMany({ where: { businessId: b.id } });
  const services: Awaited<ReturnType<typeof prisma.service.create>>[] = [];
  for (const s of spec.services) services.push(await prisma.service.create({ data: { businessId: b.id, name: s.name, duration: s.duration, price: s.price, category: s.category ?? "other", color: "#0b4a8f", isActive: true } }));
  const owner = (await prisma.staff.findFirst({ where: { businessId: b.id } }))!;
  await prisma.staff.update({ where: { id: owner.id }, data: { role: spec.kind === "clinic" ? "Doctor" : "Stylist", workingHours: HOURS } });
  const team = [owner];
  for (const [i, name] of spec.staff.entries()) {
    team.push(await prisma.staff.create({ data: { businessId: b.id, name, role: spec.kind === "clinic" ? "Doctor" : "Stylist", email: `staff${i + 1}.${spec.key}@calvy.test`, color: ["#0b4a8f", "#e8a317", "#5b6572"][i + 1] ?? "#0b4a8f", isActive: true, workingHours: HOURS } }));
  }
  await prisma.staffService.createMany({ data: team.flatMap((st) => services.map((sv) => ({ staffId: st.id, serviceId: sv.id }))), skipDuplicates: true });
  await prisma.business.update({ where: { id: b.id }, data: { onboardingCompletedAt: new Date(), onboardingStep: 9, bookingMode: spec.kind === "clinic" ? "TOKEN" : "SLOT", plan: "professional", planStatus: "active", primaryColor: "#0b4a8f" } });

  const clients = [];
  for (const [i, name] of spec.patients.entries()) {
    clients.push(await prisma.client.create({ data: { businessId: b.id, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, phone: spec.region === "IN" ? `+91 98${String(10000000 + i * 1111111).slice(0, 8)}` : `+1 212 555 01${String(10 + i * 7).padStart(2, "0")}` } }));
  }
  const now = new Date();
  const today = utcToZoned(now, spec.tz);
  const ymd = today.date;

  if (spec.kind === "salon") {
    // A full-looking day: times spread across the team, some done and paid, the rest coming up.
    const plan: [number, number, number, number, string, string][] = [
      [0, 0, 0, 570, "completed", "paid"], [1, 1, 2, 600, "completed", "paid"], [2, 2, 3, 645, "completed", "paid"],
      [3, 0, 1, 690, "confirmed", "unpaid"], [4, 1, 0, 780, "confirmed", "paid"], [5, 2, 2, 840, "confirmed", "unpaid"],
      [0, 0, 0, 900, "confirmed", "paid"], [2, 1, 3, 960, "confirmed", "unpaid"],
    ];
    for (const [c, st, sv, min, status, pay] of plan) {
      const svc = services[sv];
      const date = zonedToUtc(ymd, min, spec.tz);
      await prisma.appointment.create({ data: { businessId: b.id, clientId: clients[c % clients.length].id, staffId: team[st % team.length].id, serviceId: svc.id, date, endAt: new Date(date.getTime() + svc.duration * 60_000), duration: svc.duration, price: svc.price, status, paymentStatus: pay } });
    }
  } else {
    // Token queue for today in the session that contains "now": three done, one being served, the rest waiting.
    // One all-day session per doctor, so the queue is "open" whenever the screenshots are taken.
    const sessions = [];
    for (const st of team) {
      sessions.push(await prisma.tokenSession.create({ data: { businessId: b.id, staffId: st.id, name: "Clinic hours", weekdays: [0, 1, 2, 3, 4, 5, 6], startMin: 0, endMin: 24 * 60 - 1, minutesPerToken: 15 } }));
    }
    const active = sessions[0];
    const svc = services[0];
    const sessionDate = new Date(`${ymd}T00:00:00.000Z`);
    const states: ["DONE" | "SERVING" | "WAITING", string][] = [["DONE", "completed"], ["DONE", "completed"], ["DONE", "completed"], ["SERVING", "confirmed"], ["WAITING", "confirmed"], ["WAITING", "confirmed"], ["WAITING", "confirmed"], ["WAITING", "confirmed"]];
    for (const [i, [qs, status]] of states.entries()) {
      const eta = new Date(now.getTime() + (i - 3) * 15 * 60_000);
      await prisma.appointment.create({ data: { businessId: b.id, clientId: clients[i % clients.length].id, staffId: team[0].id, serviceId: svc.id, date: eta, endAt: new Date(eta.getTime() + svc.duration * 60_000), duration: svc.duration, price: svc.price, status, paymentStatus: "paid", tokenSessionId: active.id, sessionDate, tokenNumber: i + 1, queuePosition: i + 1, queueState: qs, estimatedAt: eta } });
    }
  }
  return b;
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new Error("Demo data is for the dev database only.");
  const host = (process.env.DATABASE_URL ?? "").match(/@([^/:?]+)/)?.[1] ?? "unknown host";
  console.log(`Seeding marketing demo data on ${host}`);
  await wipe();
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const spec of SPECS) {
    const b = await seed(spec, hash);
    console.log(`  ${spec.key.padEnd(11)} /${b.slug}  marketing-${spec.key}@calvy.test`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
