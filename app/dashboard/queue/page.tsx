import { redirect } from "next/navigation";
import Link from "next/link";
import { pageAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { safeTimeZone, utcToZoned } from "@/lib/time";
import { QueueClient } from "./QueueClient";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const session = await pageAccess("queue.control");

  const [business, services] = await Promise.all([
    prisma.business.findUnique({ where: { id: session.user.businessId }, select: { bookingMode: true, timezone: true, packId: true } }),
    prisma.service.findMany({ where: { businessId: session.user.businessId, isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!business) redirect("/login");

  if (business.bookingMode !== "TOKEN") {
    return (
      <DashboardLayout title="Queue" subtitle="Reception queue for token bookings">
        <div className="max-w-md bg-white rounded-2xl border border-[#e8e6e0] p-6 space-y-3">
          <p className="font-semibold">The queue is for businesses that book by token.</p>
          <p className="text-sm text-[#6b6b80]">Switch booking mode to Tokens in Settings to use it.</p>
          <Link href="/dashboard/settings" className="inline-block bg-[#0f0f1a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl">Open settings</Link>
        </div>
      </DashboardLayout>
    );
  }

  const today = utcToZoned(new Date(), safeTimeZone(business.timezone)).date;
  return (
    <DashboardLayout title="Queue" subtitle="Call the next token, handle no-shows, add walk-ins">
      <QueueClient today={today} services={services} />
    </DashboardLayout>
  );
}
