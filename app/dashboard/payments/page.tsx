import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PaymentsClient } from "./PaymentsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const [appointments, features] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId: session.user.businessId },
      include: { client: true, service: true },
      orderBy: { date: "desc" },
    }),
    getBusinessFeatures(session.user.businessId),
  ]);

  const rows = appointments.map(a => {
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
      date: new Date(a.date).toISOString().split("T")[0],
    };
  });

  const prepaidPaid = rows.filter(p => p.paymentStatus === "paid" && p.paymentMode === "prepaid").reduce((s, p) => s + p.price, 0);
  const totalPending = rows.filter(p => p.paymentStatus === "unpaid").reduce((s, p) => s + p.price, 0);
  const paidCount = rows.filter(p => p.paymentStatus === "paid").length;

  return <PaymentsClient payments={rows} totalPaid={prepaidPaid} totalPending={totalPending} paidCount={paidCount} csvExport={features.csvExport} />;
}
