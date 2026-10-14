import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimits, isActivePlan } from "@/lib/plans";
import { sendBookingConfirmation } from "@/lib/email";
import { sendPushToBusiness } from "@/lib/push";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");
  const staffId = searchParams.get("staffId");

  const where: Record<string, unknown> = { businessId: session.user.businessId };
  if (date) {
    const d = new Date(date);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    where.date = { gte: d, lt: next };
  }
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, service: true, staff: true },
    orderBy: { date: "asc" },
  });

  const rows = appointments.map(a => ({
    id: a.id,
    clientName: a.client.name,
    serviceName: a.service.name,
    staffName: a.staff?.name ?? null,
    date: new Date(a.date).toISOString().split("T")[0],
    time: `${new Date(a.date).getHours().toString().padStart(2, "0")}:${new Date(a.date).getMinutes().toString().padStart(2, "0")}`,
    duration: a.duration,
    price: a.price,
    status: a.status,
    paymentStatus: a.paymentStatus,
  }));

  return NextResponse.json({ appointments: rows, total: rows.length });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { clientName, clientEmail, clientPhone, staffId, date, time, notes } = body;

  // Support serviceIds[] (multi) and legacy serviceId (single)
  const serviceIds: string[] =
    Array.isArray(body.serviceIds) && body.serviceIds.length > 0
      ? body.serviceIds
      : body.serviceId
      ? [body.serviceId]
      : [];

  if (!clientName || !clientEmail || serviceIds.length === 0 || !date || !time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Plan limit check + fetch business name in one query
  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { name: true, plan: true, planStatus: true, trialEndsAt: true, currency: true },
  });
  if (!business || !isActivePlan(business.planStatus, business.plan, business.trialEndsAt)) {
    return NextResponse.json({ error: "Your trial has expired. Please upgrade to continue.", code: "PLAN_EXPIRED" }, { status: 402 });
  }
  const limits = getLimits(business.plan);
  if (limits.maxMonthlyAppointments !== -1) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const count = await prisma.appointment.count({ where: { businessId: session.user.businessId, createdAt: { gte: monthStart } } });
    if (count >= limits.maxMonthlyAppointments) {
      return NextResponse.json({ error: `Monthly appointment limit (${limits.maxMonthlyAppointments}) reached. Upgrade your plan.`, code: "LIMIT_REACHED" }, { status: 402 });
    }
  }

  const allServices = await prisma.service.findMany({
    where: { id: { in: serviceIds }, businessId: session.user.businessId },
  });
  if (allServices.length === 0) {
    return NextResponse.json({ error: "Services not found" }, { status: 404 });
  }
  // Preserve the order of selection
  const orderedServices = serviceIds.map(id => allServices.find(s => s.id === id)).filter(Boolean) as typeof allServices;

  const totalPrice = orderedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);
  const serviceNamesLabel = orderedServices.map(s => s.name).join(" & ");

  // Encode extra service names in notes using the same __services__: prefix
  const combinedNotes = (() => {
    const prefix = orderedServices.length > 1
      ? `__services__:${orderedServices.slice(1).map(s => s.name).join("|")}`
      : "";
    if (prefix && notes) return `${prefix}\n${notes}`;
    if (prefix) return prefix;
    return notes || "";
  })();

  const [hours, minutes] = time.split(":").map(Number);
  const apptDate = new Date(date);
  apptDate.setHours(hours, minutes, 0, 0);

  const client = await prisma.client.upsert({
    where: { businessId_email: { businessId: session.user.businessId, email: clientEmail } },
    update: {},
    create: {
      businessId: session.user.businessId,
      name: clientName,
      email: clientEmail,
      phone: clientPhone || "",
    },
  });

  const staffMember = staffId
    ? await prisma.staff.findUnique({ where: { id: staffId }, select: { name: true } })
    : null;

  const appointment = await prisma.appointment.create({
    data: {
      businessId: session.user.businessId,
      clientId: client.id,
      serviceId: orderedServices[0].id,
      staffId: staffId || null,
      date: apptDate,
      duration: totalDuration,
      price: totalPrice,
      notes: combinedNotes,
      status: "confirmed",
      paymentStatus: "unpaid",
    },
  });

  const dateLabel = apptDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  sendPushToBusiness(session.user.businessId, {
    title: "New appointment booked",
    body: `${clientName} — ${serviceNamesLabel} on ${dateLabel} at ${time}`,
    url: "/dashboard/appointments",
    tag: "new-booking",
  }).catch(() => {});

  try {
    await sendBookingConfirmation({
      to: clientEmail,
      clientName,
      businessName: business?.name ?? "Your provider",
      serviceName: serviceNamesLabel,
      staffName: staffMember?.name ?? "Your provider",
      date: dateLabel,
      time,
      duration: totalDuration,
      price: totalPrice,
      currency: business.currency ?? "USD",
      appointmentDate: apptDate,
    });
  } catch (err) {
    console.error("[Email] Failed to send confirmation for panel booking:", err);
  }

  return NextResponse.json({ appointment }, { status: 201 });
}
