import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadPaymentRows } from "@/lib/paymentRows";
import { redirect, notFound } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { PaymentsClient } from "./PaymentsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  if (!getFlags().payments) notFound();
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");
  const [{ rows }, features] = await Promise.all([
    loadPaymentRows(session.user.businessId),
    getBusinessFeatures(session.user.businessId),
  ]);

  const prepaidPaid = rows.filter(p => p.paymentStatus === "paid" && p.paymentMode === "prepaid").reduce((s, p) => s + p.price, 0);
  const totalPending = rows.filter(p => p.paymentStatus === "unpaid").reduce((s, p) => s + p.price, 0);
  const paidCount = rows.filter(p => p.paymentStatus === "paid").length;

  return <PaymentsClient payments={rows} totalPaid={prepaidPaid} totalPending={totalPending} paidCount={paidCount} csvExport={features.csvExport} upgradeHref="/dashboard/billing" />;
}
