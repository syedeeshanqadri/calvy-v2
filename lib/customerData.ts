import { cache } from "react";
import { getCustomer } from "@/lib/customerSession";
import { overviewForCustomer } from "@/lib/customerDb";
import { buildStats, buildUpdates, manageability, tokenMoveBlocker, type ManageCheck } from "@/lib/customerView";
import { bookingForLabel } from "@/lib/patients";
import { formatDateLabel, formatTimeLabel, safeTimeZone, utcToZoned } from "@/lib/time";
import { formatCurrencyAmount } from "@/lib/currency";
import { trackingUrl } from "@/lib/tracking";
import { meetingUrlFor } from "@/lib/online";

/** Everything the customer screens need, shaped for the browser: plain values, no raw links to other bookings. */

export const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed", pending: "Pending", pending_payment: "Awaiting payment", completed: "Completed",
  cancelled: "Cancelled", "no-show": "Missed", expired: "Expired",
};

export interface BookingView {
  id: string;
  businessName: string;
  businessSlug: string;
  businessPhone: string | null;
  serviceName: string;
  staffName: string | null;
  forName: string;
  dateLabel: string;
  timeLabel: string;
  /** YYYY-MM-DD in the business timezone: the date picker starts here. */
  dateInput: string;
  today: string;
  durationMin: number;
  priceLabel: string;
  paid: boolean;
  status: string;
  statusLabel: string;
  online: boolean;
  /** Only for the verified customer who owns the booking, and only for online bookings. */
  meetingUrl: string | null;
  tokenNumber: number | null;
  trackUrl: string | null;
  manage: ManageCheck;
  /** Queue token that was already moved to another day once: it can be cancelled, not moved again. */
  moveBlocked: string | null;
  bookAgainHref: string;
}

export interface WalletView { businessName: string; businessSlug: string; balanceLabel: string; balanceMinor: number; currency: string }

export const getCustomerData = cache(async () => {
  const me = await getCustomer();
  if (!me) return null;
  const overview = await overviewForCustomer(me);
  if (!overview) return { me, verified: false as const };

  const now = new Date();
  type Row = (typeof overview.upcoming)[number];
  const view = (a: Row): BookingView => {
    const tz = safeTimeZone(a.business.timezone);
    // The joining link only goes out for a confirmed booking that has not ended (same rule as the tracking page).
    const live = a.status === "confirmed" && a.date.getTime() + a.duration * 60_000 > now.getTime();
    const link = a.isOnline && live ? meetingUrlFor(a) : null;
    return {
      id: a.id,
      businessName: a.business.name, businessSlug: a.business.slug, businessPhone: a.business.phone ?? null,
      serviceName: a.service.name, staffName: a.staff?.name ?? null, forName: bookingForLabel(a),
      dateLabel: formatDateLabel(a.date, tz),
      timeLabel: a.tokenNumber ? `Token #${a.tokenNumber}, about ${formatTimeLabel(a.estimatedAt ?? a.date, tz)}` : formatTimeLabel(a.date, tz),
      dateInput: utcToZoned(a.date, tz).date, today: utcToZoned(now, tz).date,
      durationMin: a.duration, priceLabel: formatCurrencyAmount(a.price, a.business.currency ?? "INR"), paid: a.paymentStatus === "paid",
      status: a.status, statusLabel: STATUS_LABEL[a.status] ?? a.status,
      online: a.isOnline, meetingUrl: link,
      tokenNumber: a.tokenNumber, trackUrl: a.tokenNumber ? trackingUrl(a.business.slug, a.id) : null,
      manage: manageability({ status: a.status, date: a.date, tokenNumber: a.tokenNumber, queueState: a.queueState, business: { cancellationCutoffHours: a.business.cancellationCutoffHours, name: a.business.name } }, now),
      moveBlocked: tokenMoveBlocker(a),
      bookAgainHref: `/${a.business.slug}/book-now`,
    };
  };

  const upcoming = overview.upcoming.map(view);
  const past = overview.past.map(view);
  const all = [...overview.upcoming, ...overview.past];
  const stats = buildStats(overview.upcoming, overview.past, all.map((a) => a.business.slug));
  const updates = buildUpdates(
    all.map((a) => ({ id: a.id, date: a.date, status: a.status, businessName: a.business.name, serviceName: a.service.name, isOnline: a.isOnline })),
    overview.wallets, now,
  ).map((u) => ({ ...u, at: u.at.toISOString() }));
  const wallets: WalletView[] = overview.wallets
    .filter((w) => w.balanceMinor > 0)
    .map((w) => ({ businessName: w.businessName, businessSlug: w.businessSlug, balanceMinor: w.balanceMinor, currency: w.currency, balanceLabel: formatCurrencyAmount(w.balanceMinor / 100, w.currency) }));
  const nextAt = stats.next ? { iso: stats.next.toISOString() } : null;

  return { me, verified: true as const, upcoming, past, stats: { ...stats, next: nextAt }, updates, wallets };
});
