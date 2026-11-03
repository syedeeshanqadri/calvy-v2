import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { csvResponse, guardCsvExport } from "@/lib/csvExport";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

// Customer CSV. Server-enforced: the member needs "Customers: export" (the hidden button is not the guard).
async function GET_handler() {
  const session = await accessSession("customers.export");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;

  const refused = await guardCsvExport(businessId);
  if (refused) return refused;

  const clients = await prisma.client.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: MAX_ROWS });
  return csvResponse(
    `customers-${new Date().toISOString().slice(0, 10)}.csv`,
    [{ header: "Name" }, { header: "Email" }, { header: "Phone", phone: true }, { header: "Visits" }, { header: "Total spent" }, { header: "Last visit" }, { header: "Notes" }],
    clients.map((c) => [c.name, c.email, c.phone, c.totalAppointments, c.totalSpent, c.lastVisit ? c.lastVisit.toISOString().slice(0, 10) : "", c.notes]),
  );
}

export const GET = safeRoute(GET_handler);
