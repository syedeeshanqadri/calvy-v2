import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/validation/common";
import { appointmentExportQuery } from "@/lib/validation/appointments";
import { checkLimit, denialResponse } from "@/lib/limits";
import { csvCell } from "@/lib/csv";
import { rateLimit } from "@/lib/ratelimit";
import { safeTimeZone, utcToZoned, zonedDayRange } from "@/lib/time";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Plan check on the server, not only the hidden button.
  const denied = await checkLimit(businessId, "csv", { owner: true });
  if (denied) return denialResponse(denied);

  const rl = await rateLimit(`export:${businessId}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many exports. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

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

  const header = ["Client", "Email", "Phone", "Service", "Staff", "Date", "Time", "Duration (min)", "Price", "Currency", "Status", "Payment"];
  const lines = [
    header.map((h) => csvCell(h)).join(","),
    ...rows.map((a) => {
      const z = utcToZoned(a.date, tz);
      return [
        csvCell(a.client.name),
        csvCell(a.client.email),
        csvCell(a.client.phone, { phone: true }),
        csvCell(a.service.name),
        csvCell(a.staff?.name),
        csvCell(z.date),
        csvCell(z.time),
        csvCell(a.duration),
        csvCell(a.price),
        csvCell(biz?.currency),
        csvCell(a.status),
        csvCell(a.paymentStatus),
      ].join(",");
    }),
  ];

  const today = utcToZoned(new Date(), tz).date;
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointments-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
