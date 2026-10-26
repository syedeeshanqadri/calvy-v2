import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/flags";
import { csvResponse, guardCsvExport } from "@/lib/csvExport";
import { loadPaymentRows } from "@/lib/paymentRows";

export const dynamic = "force-dynamic";

// The Payments screen's CSV, built here (never in the browser) and only for plans with CSV export.
async function GET_handler() {
  if (!isFeatureEnabled("payments")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refused = await guardCsvExport(businessId);
  if (refused) return refused;

  const { rows, currency } = await loadPaymentRows(businessId);
  const today = new Date().toISOString().split("T")[0];
  return csvResponse(
    `payments-${today}.csv`,
    [{ header: "Client" }, { header: "Service" }, { header: "Amount" }, { header: "Currency" }, { header: "Date" }, { header: "Mode" }, { header: "Status" }],
    rows.map((p) => [p.clientName, p.serviceName, p.price, currency, p.date, p.paymentMode, p.paymentStatus]),
  );
}

export const GET = safeRoute(GET_handler);
