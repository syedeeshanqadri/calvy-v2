import Link from "next/link";
import type { LogFilters as Filters } from "@/lib/notifications/log";

const field = "h-9 rounded-lg border border-[#e5e2dc] bg-white px-2 text-sm text-[#0f0f1a] focus:outline-none focus:ring-2 focus:ring-[#0284c7]";

/** Plain GET form: filters live in the URL, so a filtered view can be shared and needs no client JS. */
export function LogFilters({ action, filters, searchHint, showAudience = true }: { action: string; filters: Filters; searchHint: string; showAudience?: boolean }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-[#6b6b80]">Status
        <select name="status" defaultValue={filters.status ?? ""} className={field}>
          <option value="">All</option><option value="SENT">Sent</option><option value="FAILED">Failed</option>
          <option value="SKIPPED">Skipped</option><option value="PENDING">Waiting</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#6b6b80]">Channel
        <select name="channel" defaultValue={filters.channel ?? ""} className={field}>
          <option value="">All</option><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option>
        </select>
      </label>
      {showAudience && (
        <label className="flex flex-col gap-1 text-xs text-[#6b6b80]">To
          <select name="audience" defaultValue={filters.audience ?? ""} className={field}>
            <option value="">Everyone</option><option value="CUSTOMER">Customers</option><option value="BUSINESS">Business</option><option value="PLATFORM">Platform</option>
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-[#6b6b80]">Period
        <select name="days" defaultValue={String(filters.days)} className={field}>
          <option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
        </select>
      </label>
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[#6b6b80]">Search
        <input name="q" defaultValue={filters.q ?? ""} placeholder={searchHint} className={field} maxLength={100} />
      </label>
      <button type="submit" className="h-9 rounded-lg bg-[#0f0f1a] px-4 text-sm font-medium text-white hover:bg-[#2a2a3a]">Apply</button>
      <Link href={action} className="h-9 px-2 text-sm leading-9 text-[#6b6b80] hover:text-[#0f0f1a]">Reset</Link>
    </form>
  );
}

/** Newer / Older links that keep the current filters. */
export function LogPager({ action, filters, hasMore }: { action: string; filters: Filters; hasMore: boolean }) {
  const href = (page: number) => {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.channel) p.set("channel", filters.channel);
    if (filters.audience) p.set("audience", filters.audience);
    if (filters.days !== 7) p.set("days", String(filters.days));
    if (filters.q) p.set("q", filters.q);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `${action}?${qs}` : action;
  };
  if (filters.page === 1 && !hasMore) return null;
  return (
    <nav className="flex items-center justify-between pt-3 text-sm" aria-label="Pages">
      {filters.page > 1 ? <Link href={href(filters.page - 1)} className="text-[#0284c7] hover:underline">← Newer</Link> : <span />}
      <span className="text-[#6b6b80]">Page {filters.page}</span>
      {hasMore ? <Link href={href(filters.page + 1)} className="text-[#0284c7] hover:underline">Older →</Link> : <span />}
    </nav>
  );
}
