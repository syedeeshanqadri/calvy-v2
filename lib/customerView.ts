// What /my shows (pure): bookings split into upcoming and past, and wallet balances per business.
import { creditBalance } from "@/lib/credit";

export interface BookingRow {
  id: string;
  date: Date;
  status: string;
  holdExpiresAt?: Date | null;
}

const LIVE = ["confirmed", "pending", "pending_payment"];

/** Upcoming: not yet over and still active (a pending payment only while its hold is live). Newest past first. */
export function splitBookings<T extends BookingRow>(rows: T[], now: Date = new Date()): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const r of rows) {
    const live = LIVE.includes(r.status) && !(r.status === "pending_payment" && !(r.holdExpiresAt && r.holdExpiresAt.getTime() > now.getTime()));
    (live && r.date.getTime() >= now.getTime() ? upcoming : past).push(r);
  }
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  past.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { upcoming, past };
}

export interface CreditRow { businessId: string; businessName: string; businessSlug: string; currency: string; amountMinor: number }
export interface Wallet { businessId: string; businessName: string; businessSlug: string; currency: string; balanceMinor: number }

/** One wallet per business: the ledger entries summed (a balance never mixes businesses or currencies). */
export function walletsByBusiness(rows: CreditRow[]): Wallet[] {
  const by = new Map<string, CreditRow[]>();
  for (const r of rows) by.set(r.businessId, [...(by.get(r.businessId) ?? []), r]);
  return [...by.values()]
    .map((group) => ({
      businessId: group[0].businessId, businessName: group[0].businessName, businessSlug: group[0].businessSlug,
      currency: group[0].currency, balanceMinor: creditBalance(group),
    }))
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
}
