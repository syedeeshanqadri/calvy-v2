import type { Appointment, Business, Client, Service, Staff } from "@prisma/client";
import type { NotificationInput } from "@/lib/notifications/enqueue";
import type { InvoicePayload } from "@/lib/notifications/templates";
import { serviceLabel } from "@/lib/onlinePayment";
import { t } from "@/lib/terms";
import { formatDateLabel, formatTimeLabel, safeTimeZone } from "@/lib/time";

type FullAppointment = Appointment & { client: Client; service: Service; staff: Staff | null; business: Business };

/** The receipt for a paid appointment; null when the customer has no email. One per appointment, however often it fires. */
export function receiptNotification(a: FullAppointment): NotificationInput | null {
  if (!a.client.email) return null;
  const tz = safeTimeZone(a.business.timezone);
  const payload: InvoicePayload = {
    invoiceNumber: `INV-${a.id.slice(-8).toUpperCase()}`,
    clientEmail: a.client.email,
    clientName: a.client.name,
    patientName: a.patientName ?? undefined,
    businessName: a.business.name,
    serviceName: serviceLabel(a.service.name, a.notes),
    staffName: a.staff?.name ?? `Your ${t(a.business, "staff")}`,
    date: formatDateLabel(a.date, tz),
    time: formatTimeLabel(a.date, tz),
    duration: a.duration,
    price: a.price,
    currency: a.business.currency ?? undefined,
  };
  return {
    event: "booking.paid", audience: "CUSTOMER", subjectId: a.id, recipient: a.client.email,
    template: "invoice", payload, businessId: a.businessId, appointmentId: a.id,
  };
}
