// Invoice / receipt PDF (pdf-lib, standard fonts). A tax invoice only with a GSTIN; without one it is a plain "Receipt" with no GST line.
// The standard fonts have no rupee sign, so amounts are written "Rs 349.00".
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { planName } from "@/lib/subscriptions/rules";
import { CONTACT } from "@/lib/site";

export interface InvoicePdfInput {
  number: string;
  kind: "TAX_INVOICE" | "RECEIPT";
  issuedAt: Date;
  planId: string;
  interval: string;
  periodStart: Date;
  periodEnd: Date;
  grossMinor: number;
  creditMinor: number;
  /** A plan coupon, its own line (optional so older callers keep working). */
  couponMinor?: number;
  couponCode?: string | null;
  amountMinor: number;
  taxableMinor: number;
  gstMinor: number;
  gstRate: number;
  paymentMethodLabel: string | null;
  /** INR (default) or USD, and the tax treatment: GST (India), IGST (export without an LUT) or LUT (export under a Letter of Undertaking, no tax line). */
  currency?: string;
  taxKind?: "GST" | "IGST" | "LUT";
  lutNumber?: string | null;
  customer: { businessName: string; email: string | null };
  issuer: { legalName: string | null; address: string | null; gstin: string | null; cin: string | null };
}

const moneyIn = (currency: string) => (minor: number) =>
  currency === "USD" ? `$${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `Rs ${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateIn = (currency: string) => (d: Date) => currency === "USD" ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
/** WinAnsi can only draw Latin-1: anything else (a customer's business name in another script) becomes "?" instead of crashing the PDF. */
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

export async function buildInvoicePdf(i: InvoicePdfInput): Promise<Uint8Array> {
  const currency = i.currency ?? "INR", taxKind = i.taxKind ?? "GST";
  const rs = moneyIn(currency), date = dateIn(currency);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.06, 0.1), muted = rgb(0.42, 0.42, 0.5);
  let y = 790;
  const text = (t: string, x: number, size = 10, f = font, color = ink) => page.drawText(safe(t), { x, y, size, font: f, color });
  const right = (t: string, xRight: number, size = 10, f = font) => page.drawText(safe(t), { x: xRight - f.widthOfTextAtSize(safe(t), size), y, size, font: f, color: ink });
  const line = () => { page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.6, color: rgb(0.9, 0.9, 0.88) }); };

  const title = i.kind === "TAX_INVOICE" ? "Tax invoice" : "Receipt";
  text(i.issuer.legalName ?? CONTACT.legalName, 50, 16, bold); right(title, 545, 16, bold); y -= 20;
  text(i.issuer.address ?? CONTACT.address, 50, 9, font, muted); right(`No. ${i.number}`, 545, 10, bold); y -= 13;
  if (i.kind === "TAX_INVOICE" && i.issuer.gstin) { text(`GSTIN: ${i.issuer.gstin}`, 50, 9, font, muted); }
  if (i.issuer.cin) { y -= 12; text(`CIN: ${i.issuer.cin}`, 50, 9, font, muted); y += 12; }
  right(`Date: ${date(i.issuedAt)}`, 545, 10); y -= 36;

  text("Billed to", 50, 9, font, muted); y -= 14;
  text(i.customer.businessName, 50, 11, bold); y -= 13;
  if (i.customer.email) { text(i.customer.email, 50, 10); y -= 13; }
  y -= 14; line(); y -= 18;

  text("Description", 50, 9, bold); right("Amount", 545, 9, bold); y -= 16;
  const desc = `Calvy ${planName(i.planId)} plan, ${i.interval === "YEARLY" ? "yearly" : "monthly"} (${date(i.periodStart)} to ${date(i.periodEnd)})`;
  text(desc, 50, 10); right(rs(i.grossMinor), 545, 10); y -= 16;
  if (i.creditMinor > 0) { text("Credit for the unused part of your previous plan", 50, 10); right(`- ${rs(i.creditMinor)}`, 545, 10); y -= 16; }
  if ((i.couponMinor ?? 0) > 0) { text(`Coupon ${i.couponCode ?? ""} (-${rs(i.couponMinor ?? 0)})`.replace("Coupon  ", "Coupon "), 50, 10); right(`- ${rs(i.couponMinor ?? 0)}`, 545, 10); y -= 16; }
  y -= 4; line(); y -= 18;
  // A tax line only where tax applies: GST (India) or IGST (export without an LUT). An export under an LUT carries none and says so.
  if (i.kind === "TAX_INVOICE" && taxKind !== "LUT") {
    text("Taxable value", 300, 10); right(rs(i.taxableMinor), 545, 10); y -= 15;
    text(`${taxKind} @ ${i.gstRate}% (included)`, 300, 10); right(rs(i.gstMinor), 545, 10); y -= 15;
  }
  text("Total paid", 300, 11, bold); right(rs(i.amountMinor), 545, 11, bold); y -= 24;
  if (i.paymentMethodLabel) { text(`Paid by ${i.paymentMethodLabel}`, 50, 9, font, muted); y -= 14; }
  text(i.kind !== "TAX_INVOICE" ? "This is a receipt, not a tax invoice." : taxKind === "LUT" ? `Supply of services for export under Letter of Undertaking ${i.lutNumber ?? ""}. No tax charged.` : `Amounts include ${taxKind}.`, 50, 9, font, muted);
  y -= 40;
  text("Calvy plan billing. Questions: support@calvy.io", 50, 9, font, muted);
  return pdf.save();
}
