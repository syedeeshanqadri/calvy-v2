import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/validation/common";
import { appointmentExportQuery } from "@/lib/validation/appointments";
import { csvResponse, guardCsvExport } from "@/lib/csvExport";
import { safeTimeZone, utcToZoned, zonedDayRange } from "@/lib/time";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

async function GET_handler(request: NextRequest) {
  const session = await accessSession("reports.view");
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Plan check on the server, not only the hidden button.
  const refused = await guardCsvExport(businessId);
  if (refused) return refused;

  const q = parseQuery(request.url, appointmentExportQuery);
  if (!q.ok) return q.res;
  const { status, staffId, from, to, q: search } = q.data;

  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true, currency: true } });
  const tz = safeTimeZone(biz?.timezone);

  const where: Record<string, unknown> = { businessId };
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;
  if (from || to) {
    where.date = {
      ...(from && { gte: zonedDayRange(from, tz).start }),
      ...(to && { lt: zonedDayRange(to, tz).end }),
    };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, service: true, staff: true },
    orderBy: { date: "desc" },
    take: MAX_ROWS,
  });

  const needle = search?.toLowerCase();
  const rows = appointments.filter(
    (a) => !needle || a.client.name.toLowerCase().includes(needle) || a.service.name.toLowerCase().includes(needle),
  );

  const today = utcToZoned(new Date(), tz).date;
  return csvResponse(
    `appointments-${today}.csv`,
    [
      { header: "Client" }, { header: "Email" }, { header: "Phone", phone: true }, { header: "Service" }, { header: "Staff" },
      { header: "Date" }, { header: "Time" }, { header: "Duration (min)" }, { header: "Price" }, { header: "Currency" },
      { header: "Status" }, { header: "Payment" },
    ],
    rows.map((a) => {
      const z = utcToZoned(a.date, tz);
      return [a.client.name, a.client.email, a.client.phone, a.service.name, a.staff?.name, z.date, z.time, a.duration, a.price, biz?.currency, a.status, a.paymentStatus];
    }),
  );
}

export const GET = safeRoute(GET_handler);
