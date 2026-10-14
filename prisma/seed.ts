import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

async function main() {
  console.log("🌱 Seeding database...");

  const password = await bcrypt.hash("password123", 12);

  // Demo user + business
  const user = await prisma.user.upsert({
    where: { email: "demo@calvy.io" },
    update: {},
    create: { name: "Alex Johnson", email: "demo@calvy.io", password, emailVerified: new Date() },
  });

  const existingBusiness = await prisma.business.findUnique({ where: { ownerId: user.id } });
  if (existingBusiness) {
    console.log("✅ Demo data already exists — skipping.");
    return;
  }

  const business = await prisma.business.create({
    data: {
      name: "Alex Johnson Studio",
      slug: "alex-johnson-studio",
      plan: "professional",
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
    ],
  });

  console.log("✅ Seed complete!");
  console.log("   Login:  demo@calvy.io");
  console.log("   Pass:   password123");
  console.log(`   Book:   http://localhost:3001/b/alex-johnson-studio`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
