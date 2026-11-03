import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminSession } from "@/lib/adminAuth";
import { LogFilters, LogPager } from "@/components/notifications/LogFilters";
import { LogTable } from "@/components/notifications/LogTable";
import { adminLogWhere, failureRate, listLog, parseLogFilters, since } from "@/lib/notifications/log";

export const dynamic = "force-dynamic";
const ACTION = "/admin/notifications/log";
const pct = (r: number) => `${(r * 100).toFixed(r && r < 0.1 ? 1 : 0)}%`;

/** Super-admin delivery log across every business and platform mail. Recipients masked, no payloads (chunk 6). */
export default async function AdminNotificationLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAdminSession())) redirect("/login");
  const filters = parseLogFilters(await searchParams);
  const now = new Date();
  const matched = filters.q
    ? await prisma.business.findMany({
        where: { OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { slug: { contains: filters.q, mode: "insensitive" } }] },
        select: { id: true }, take: 50,
      })
    : [];
  const [{ rows, hasMore }, grouped] = await Promise.all([
    listLog(adminLogWhere(filters, now, matched.map((b) => b.id)), filters.page, { mask: true, now }),
    prisma.notificationOutbox.groupBy({
      by: ["businessId", "status"], where: { createdAt: { gte: since(filters.days, now) } }, _count: { _all: true },
    }),
  ]);

  const stats = new Map<string, { businessId: string | null; sent: number; failed: number; skipped: number; total: number }>();
  for (const g of grouped) {
    const key = g.businessId ?? "";
    const s = stats.get(key) ?? { businessId: g.businessId, sent: 0, failed: 0, skipped: 0, total: 0 };
    const n = g._count._all;
    s.total += n;
    if (g.status === "SENT") s.sent += n;
    if (g.status === "FAILED") s.failed += n;
    if (g.status === "SKIPPED") s.skipped += n;
    stats.set(key, s);
  }
  const all = [...stats.values()];
  const totals = all.reduce((t, s) => ({ sent: t.sent + s.sent, failed: t.failed + s.failed, total: t.total + s.total }), { sent: 0, failed: 0, total: 0 });
  const worst = all
    .filter((s) => s.failed > 0)
    .sort((a, b) => failureRate(b.sent, b.failed) - failureRate(a.sent, a.failed) || b.failed - a.failed)
    .slice(0, 15);

  const ids = [...new Set([...rows.map((r) => r.businessId), ...worst.map((s) => s.businessId)].filter((x): x is string => !!x))];
  const businesses = ids.length ? await prisma.business.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = Object.fromEntries(businesses.map((b) => [b.id, b.name]));
  const period = filters.days === 1 ? "24h" : `${filters.days}d`;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f0f1a]">Delivery log</h1>
          <p className="text-sm text-[#6b6b80]">Email and WhatsApp messages across all businesses. Recipients are masked; search an exact email or phone to find one.</p>
        </div>
        <Link href="/admin/notifications" className="text-sm text-[#0284c7] hover:underline">Push broadcast →</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: `Messages · ${period}`, value: String(totals.total) },
          { label: "Sent", value: String(totals.sent) },
          { label: "Failed", value: String(totals.failed) },
          { label: "Failure rate", value: pct(failureRate(totals.sent, totals.failed)) },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-[#f0ede8] bg-white px-4 py-3">
            <div className="text-xs text-[#6b6b80]">{t.label}</div>
            <div className="text-xl font-semibold text-[#0f0f1a]">{t.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-[#f0ede8] bg-white p-4 md:p-6">
        <h2 className="mb-3 text-sm font-semibold text-[#0f0f1a]">Highest failure rates · {period}</h2>
        {worst.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-[#f0ede8] text-xs uppercase tracking-wide text-[#6b6b80]">
                <tr><th className="py-2 pr-3 font-medium">Business</th><th className="py-2 pr-3 font-medium">Failed</th><th className="py-2 pr-3 font-medium">Sent</th><th className="py-2 pr-3 font-medium">Skipped</th><th className="py-2 font-medium">Failure rate</th></tr>
              </thead>
              <tbody>
                {worst.map((s) => {
                  const name = s.businessId ? names[s.businessId] ?? "Deleted business" : "Platform";
                  const q = s.businessId ? names[s.businessId] : undefined;
                  return (
                    <tr key={s.businessId ?? "platform"} className="border-b border-[#f0ede8] last:border-0">
                      <td className="py-2 pr-3">
                        {q ? <Link className="text-[#0284c7] hover:underline" href={`${ACTION}?status=FAILED&days=${filters.days}&q=${encodeURIComponent(q)}`}>{name}</Link> : name}
                      </td>
                      <td className="py-2 pr-3">{s.failed}</td><td className="py-2 pr-3">{s.sent}</td><td className="py-2 pr-3">{s.skipped}</td>
                      <td className="py-2 font-medium text-red-700">{pct(failureRate(s.sent, s.failed))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-[#6b6b80]">No failures in this period.</p>}
      </section>

      <section className="space-y-4 rounded-2xl border border-[#f0ede8] bg-white p-4 md:p-6">
        <LogFilters action={ACTION} filters={filters} searchHint="Business, event, exact email/phone or id" />
        <LogTable rows={rows} resendBase="/api/admin/notifications/log" businessNames={names} />
        <LogPager action={ACTION} filters={filters} hasMore={hasMore} />
      </section>
    </div>
  );
}
