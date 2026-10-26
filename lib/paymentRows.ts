import { prisma } from "@/lib/prisma";
import { safeTimeZone, utcToZoned } from "@/lib/time";

export interface PaymentRow {
  id: string; clientName: string; serviceName: string;
  price: number; paymentStatus: string; paymentMode: string; date: string;
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
  const rows = appointments.map((a) => {
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
    };
  });
  return { rows, currency: biz?.currency ?? null };
}
