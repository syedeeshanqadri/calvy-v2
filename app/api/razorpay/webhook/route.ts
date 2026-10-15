import { zonedTimeToUtc, safeTimeZone } from "@/lib/time";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transferPaymentToAccount } from "@/lib/razorpay";
import { sendBookingConfirmation, sendInvoice } from "@/lib/email";
import { sendBookingConfirmationWhatsApp } from "@/lib/whatsapp";
import { sendPushToBusiness } from "@/lib/push";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret || !sig) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 400 });
  }

  if (!verifySignature(body, sig, secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let event: { event: string; payload: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event !== "payment_link.paid") {
    return NextResponse.json({ received: true });
  }

  const linkEntity = (event.payload as any)?.payment_link?.entity;
  const paymentEntity = (event.payload as any)?.payment?.entity;
  const meta: Record<string, string> = linkEntity?.notes ?? {};
  const paymentId: string = paymentEntity?.id ?? linkEntity?.id;

  if (!meta.businessSlug || !meta.clientEmail || !paymentId) {
    return NextResponse.json({ received: true });
  }

  // Idempotency — skip if already processed
  const existing = await prisma.appointment.findFirst({ where: { razorpayPaymentId: paymentId } });
  if (existing) return NextResponse.json({ received: true });

  const business = await prisma.business.findUnique({ where: { slug: meta.businessSlug } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  let serviceIds: string[];
  if (meta.serviceIds) {
    try { serviceIds = JSON.parse(meta.serviceIds); } catch { serviceIds = [meta.serviceIds]; }
  } else if (meta.serviceId) {
    serviceIds = [meta.serviceId];
  } else {
    return NextResponse.json({ received: true });
  }

  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
  if (services.length === 0) return NextResponse.json({ received: true });

  const servicesMap = new Map(services.map(s => [s.id, s]));
  const orderedServices = serviceIds.map(id => servicesMap.get(id)).filter(Boolean) as typeof services;

  const totalPrice = orderedServices.reduce((sum, s) => sum + s.price, 0);
  const serviceNamesLabel = orderedServices.map(s => s.name).join(" & ");
  const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);

  let client = await prisma.client.findUnique({
    where: { businessId_email: { businessId: business.id, email: meta.clientEmail } },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        businessId: business.id,
        name: meta.clientName,
        email: meta.clientEmail,
        phone: meta.clientPhone || null,
      },
    });
  }

  const appointmentDate = zonedTimeToUtc(meta.date, meta.time, safeTimeZone(business.timezone));

  const combinedNotes = (() => {
    const prefix =
      orderedServices.length > 1
        ? `__services__:${orderedServices.slice(1).map(s => s.name).join("|")}`
        : "";
    if (prefix && meta.notes) return `${prefix}\n${meta.notes}`;
    if (prefix) return prefix;
    return meta.notes || null;
  })();

  // Route split: if the tenant has an activated linked account, pay them
  // directly from this payment. A successful transfer is recorded on the
  // appointment (razorpayTransferId) so it is excluded from the wallet balance
  // (which is computed from non-routed paid appointments) — otherwise the
  // tenant would be paid twice. If the transfer fails or the tenant isn't on
  // Route, the appointment counts toward their withdrawable wallet balance.
  const realPaymentId: string | undefined = paymentEntity?.id;
  let transferId: string | null = null;
  if (business.razorpayConnectAccountId && business.routeStatus === "activated" && realPaymentId) {
    try {
      transferId = await transferPaymentToAccount(
        realPaymentId,
        business.razorpayConnectAccountId,
        Math.round(totalPrice * 100),
        business.currency ?? DEFAULT_CURRENCY,
      );
    } catch (err) {
      console.error("[Route] Transfer failed, leaving payment in wallet:", err);
    }
  }

  const appointment = await prisma.appointment.create({
    data: {
      businessId: business.id,
      clientId: client.id,
      staffId: meta.staffId || null,
      serviceId: orderedServices[0].id,
      date: appointmentDate,
      endAt: new Date(appointmentDate.getTime() + totalDuration * 60_000),
      duration: totalDuration,
      price: totalPrice,
      status: "confirmed",
      notes: combinedNotes,
      razorpayPaymentId: paymentId,
      razorpayTransferId: transferId || null,
      paymentStatus: "paid",
      paymentMode: "prepaid",
    },
  });

  await prisma.client.update({
    where: { id: client.id },
    data: {
      totalAppointments: { increment: 1 },
      totalSpent: { increment: totalPrice },
      lastVisit: appointmentDate,
    },
  });

  const dateLabel = new Date(meta.date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const staffMember = meta.staffId
    ? await prisma.staff.findUnique({ where: { id: meta.staffId }, select: { name: true } })
    : null;

  sendPushToBusiness(business.id, {
    title: "Payment received — new booking",
    body: `${meta.clientName} — ${serviceNamesLabel} on ${dateLabel} at ${meta.time}`,
    url: "/dashboard/appointments",
    tag: "new-booking",
  }).catch(() => {});

  const emailBase = {
    to: meta.clientEmail,
    clientName: meta.clientName,
    businessName: business.name,
    serviceName: serviceNamesLabel,
    staffName: staffMember?.name ?? "Your provider",
    date: dateLabel,
    time: meta.time,
    duration: totalDuration,
    price: totalPrice,
    currency: business.currency ?? DEFAULT_CURRENCY,
    ctx: { appointmentId: appointment.id, businessId: business.id },
  };
  try {
    await sendBookingConfirmation({ ...emailBase, appointmentDate });
    // Paid prepaid booking → send a receipt/invoice too.
    await sendInvoice({
      ...emailBase,
      invoiceNumber: `INV-${appointment.id.slice(-8).toUpperCase()}`,
      clientEmail: meta.clientEmail,
      paymentRef: paymentId,
    });
  } catch (err) {
    console.error("[Email] Failed:", err);
  }

  if (meta.clientPhone) {
    try {
      await sendBookingConfirmationWhatsApp({
        to: meta.clientPhone,
        clientName: meta.clientName,
        serviceName: serviceNamesLabel,
        businessName: business.name,
        date: dateLabel,
        time: meta.time,
      });
    } catch (err) {
      console.error("[WhatsApp] Failed:", err);
    }
  }

  return NextResponse.json({ received: true });
}
