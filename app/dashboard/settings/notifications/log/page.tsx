import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/Card";
import { LogFilters, LogPager } from "@/components/notifications/LogFilters";
import { LogTable } from "@/components/notifications/LogTable";
import { listLog, ownerLogWhere, parseLogFilters, since } from "@/lib/notifications/log";

export const dynamic = "force-dynamic";
const ACTION = "/dashboard/settings/notifications/log";

/** Owner delivery log: every email/WhatsApp message of this business, newest first (chunk 6). */
export default async function NotificationLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.kind !== "customer" ? session?.user?.businessId : undefined;
  if (!businessId) redirect("/login");
  const filters = parseLogFilters(await searchParams);
  const now = new Date();
  const [{ rows, hasMore }, counts] = await Promise.all([
    listLog(ownerLogWhere(businessId, filters, now), filters.page, { mask: false, now }),
    prisma.notificationOutbox.groupBy({
      by: ["status"], where: { businessId, createdAt: { gte: since(filters.days, now) } }, _count: { _all: true },
    }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const tiles = [
    { label: "Sent", value: count("SENT") },
    { label: "Failed", value: count("FAILED") },
    { label: "Skipped", value: count("SKIPPED") },
    { label: "Waiting", value: count("PENDING") + count("SENDING") },
  ];

  return (
    <DashboardLayout title="Notifications log" subtitle="Every email and WhatsApp message sent for your business">
      <div className="max-w-5xl space-y-4">
        <Link href="/dashboard/settings/notifications" className="inline-flex items-center gap-1.5 text-sm text-[#6b6b80] hover:text-[#0f0f1a]">
          <ArrowLeft size={14} /> Notification settings
        </Link>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-[#f0ede8] bg-white px-4 py-3">
              <div className="text-xs text-[#6b6b80]">{t.label} · {filters.days === 1 ? "24h" : `${filters.days}d`}</div>
              <div className="text-xl font-semibold text-[#0f0f1a]">{t.value}</div>
            </div>
          ))}
        </div>
        <Card>
          <CardContent className="space-y-4 pt-5">
            <LogFilters action={ACTION} filters={filters} searchHint="Email, phone or message type" />
            <p className="text-xs text-[#6b6b80]">Skipped means we chose not to send (switched off, unsubscribed, booking changed or expired). Failed messages from the last 7 days can be resent; sign-in links cannot.</p>
            <LogTable rows={rows} resendBase="/api/notifications/log" />
            <LogPager action={ACTION} filters={filters} hasMore={hasMore} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
