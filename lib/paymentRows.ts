import { prisma } from "@/lib/prisma";
import { safeTimeZone, utcToZoned } from "@/lib/time";

export interface PaymentRow {
  id: string; clientName: string; serviceName: string;
  price: number; paymentStatus: string; paymentMode: string; date: string;
  /** The online payment of this booking: which gateway took it ("Calvy confirmation fee" for the Rs 10), its status and amount. */
  online: { paymentId: string; gateway: string; status: string; amountMinor: number; refundedMinor: number; refundable: boolean } | null;
}

/** The Payments screen's rows, and the same rows its CSV export contains. */
export async function loadPaymentRows(businessId: string): Promise<{ rows: PaymentRow[]; currency: string | null }> {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true, currency: true } });
  const tz = safeTimeZone(biz?.timezone);
  const appointments = await prisma.appointment.findMany({
    where: { businessId },
    include: { client: true, service: true },
    orderBy: { date: "desc" },
  });
  const payments = await prisma.payment.findMany({
    where: { businessId, appointmentId: { in: appointments.map((a) => a.id) }, status: { in: ["PAID", "REFUNDED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, appointmentId: true, provider: true, gatewayId: true, status: true, amountMinor: true, refundedMinor: true, platformFeeMinor: true },
  });
  const latest = new Map<string, (typeof payments)[number]>();
  for (const pay of payments) if (pay.appointmentId && !latest.has(pay.appointmentId)) latest.set(pay.appointmentId, pay);
  const rows = appointments.map((a) => {
    const pay = latest.get(a.id);
    let serviceName = a.service.name;
    if (a.notes?.startsWith("__services__:")) {
      const extra = a.notes.split("\n")[0].replace("__services__:", "").split("|").filter(Boolean);
      serviceName = [a.service.name, ...extra].join(" & ");
    }
    return {
      id: a.id,
      clientName: a.client.name,
      serviceName,
      price: a.price,
      paymentStatus: a.paymentStatus,
      paymentMode: (a as { paymentMode?: string }).paymentMode ?? "prepaid",
      date: utcToZoned(a.date, tz).date,
      online: pay ? {
        paymentId: pay.id,
        gateway: pay.gatewayId ? ({ RAZORPAY: "Razorpay", CASHFREE: "Cashfree", PHONEPE: "PhonePe", MOCK: "Test" } as Record<string, string>)[pay.provider] ?? pay.provider : "Calvy confirmation fee",
        status: pay.status === "REFUNDED" ? "Refunded" : "Paid",
        amountMinor: pay.amountMinor, refundedMinor: pay.refundedMinor,
        // Only money the business took through its own gateway is refunded here; the Rs 10 is Calvy's and is never refunded.
        refundable: pay.status === "PAID" && !!pay.gatewayId,
      } : null,
    };
  });
  return { rows, currency: biz?.currency ?? null };
}
