import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { buildInvoicePdf } from "@/lib/subscriptions/invoicePdf";
import { invoiceIssuer } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Download one invoice or receipt as a PDF. Owner only, and only the business's own. */
async function GET_handler(_req: NextRequest, { params }: Ctx) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inv = await prisma.subscriptionInvoice.findFirst({ where: { id, businessId: session.user.businessId }, include: { business: { select: { name: true, email: true, owner: { select: { email: true } } } } } });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await buildInvoicePdf({
    number: inv.number, kind: inv.kind === "TAX_INVOICE" ? "TAX_INVOICE" : "RECEIPT", issuedAt: inv.issuedAt, planId: inv.planId, interval: inv.interval,
    periodStart: inv.periodStart, periodEnd: inv.periodEnd, grossMinor: inv.grossMinor, creditMinor: inv.creditMinor, couponMinor: inv.couponMinor, couponCode: inv.couponCode, amountMinor: inv.amountMinor,
    taxableMinor: inv.taxableMinor, gstMinor: inv.gstMinor, gstRate: inv.gstRate, paymentMethodLabel: inv.paymentMethodLabel,
    customer: { businessName: inv.business.name, email: inv.business.email ?? inv.business.owner?.email ?? null }, issuer: invoiceIssuer(),
  });
  const file = `${inv.number.replace(/\//g, "-")}.pdf`;
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, no-store" } });
}

export const GET = safeRoute(GET_handler);
