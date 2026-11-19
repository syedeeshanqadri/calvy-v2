// The appointments list's row shape, shared by the page (first window) and the history API (older pages). Selects only what a row shows.
import type { Prisma } from "@prisma/client";
import { meetingUrlFor } from "@/lib/online";
import { utcToZoned } from "@/lib/time";
import { bookingForLabel } from "@/lib/patients";

export const appointmentRowSelect = {
  id: true, date: true, duration: true, price: true, status: true, paymentStatus: true, paymentMode: true, notes: true, patientName: true,
  staffId: true, tokenNumber: true, isOnline: true, followUpOfId: true, meetingUrl: true,
  client: { select: { name: true, email: true, phone: true } },
  service: { select: { name: true, color: true, meetingUrl: true } },
  staff: { select: { name: true, meetingUrl: true } },
  payments: { where: { status: "PAID" }, select: { id: true }, take: 1 },
} satisfies Prisma.AppointmentSelect;

type RowSource = Prisma.AppointmentGetPayload<{ select: typeof appointmentRowSelect }>;

export function toAppointmentRow(a: RowSource, tz: string) {
  // Multi-service bookings store extra names as "__services__:Name2|Name3\n..." prefix
  let serviceName = a.service.name;
  let notes: string | undefined = a.notes ?? undefined;
  if (a.notes?.startsWith("__services__:")) {
    const [prefixLine, ...rest] = a.notes.split("\n");
    const extraNames = prefixLine.replace("__services__:", "").split("|").filter(Boolean);
    serviceName = [a.service.name, ...extraNames].join(" & ");
    notes = rest.join("\n") || undefined;
  }
  const z = utcToZoned(a.date, tz);
  return {
    id: a.id,
    clientName: bookingForLabel(a),
    clientEmail: a.client.email ?? a.client.phone ?? "",
    serviceName,
    staffId: a.staffId,
    staffName: a.staff?.name ?? "—",
    date: z.date,
    time: z.time,
    duration: a.duration,
    price: a.price,
    status: a.status,
    paymentStatus: a.paymentStatus,
    paymentMode: a.paymentMode ?? "postpaid",
    color: a.service.color,
    tokenNumber: a.tokenNumber,
    isOnline: a.isOnline,
    isFollowUp: !!a.followUpOfId,
    paidOnline: a.payments.length > 0,
    meetingUrl: meetingUrlFor(a),
    notes,
  };
}
