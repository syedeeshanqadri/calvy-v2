import { Star } from "lucide-react";
import type { BookingView } from "@/lib/customerData";
import { EmptyState, SectionHeading } from "@/components/my/AccountCards";

/** Completed visits, each with a "Leave a review" button where the business has set a review link. Reviews are posted on Google: Calvy keeps none of its own. */
export function RateVisits({ visits }: { visits: BookingView[] }) {
  const rows = visits.filter((v) => v.status === "completed" && v.reviewUrl).slice(0, 6);
  return (
    <section aria-labelledby="rate">
      <SectionHeading id="rate" title="Rate your visits" hint="Reviews are posted on Google, on the business's own page." />
      {rows.length === 0 ? (
        <EmptyState title="Nothing to rate yet" body="After a completed visit, a business that has a Google review page will appear here so you can leave a review." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>li]:min-w-0" data-testid="rate-list">
          {rows.map((v) => (
            <li key={v.id} className="acct-card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-cv-ink">{v.businessName}</p>
                <p className="truncate text-sm text-cv-mute">{v.serviceName} · {v.dateLabel}</p>
              </div>
              <a href={v.reviewUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-cv-marigold px-4 text-sm font-semibold text-cv-ink hover:brightness-95"><Star size={15} aria-hidden />Leave a review</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
