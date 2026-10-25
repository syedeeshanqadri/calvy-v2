"use client";
import { saveAgain, type AgainMode } from "@/lib/bookAgain";

/**
 * "Book another appointment" on a confirmation screen: two large buttons. Each is a full separate
 * booking (own token, payment, email and tracking link); the choice is handed to the booking page
 * through sessionStorage, nothing goes in the URL.
 */
export function AnotherBooking({ slug, bookPath, serviceIds, staffId, date, appointmentWord }: {
  slug: string;
  /** Where the booking page lives, e.g. "/clinic/book-now". */
  bookPath: string;
  serviceIds: string[];
  staffId: string | null;
  /** YYYY-MM-DD of the booking just made. */
  date: string;
  appointmentWord: string;
}) {
  function go(mode: AgainMode) {
    saveAgain(slug, { mode, serviceIds, staffId, date });
    window.location.assign(bookPath);
  }
  const cls = "block w-full min-h-14 rounded-2xl border border-[#e8e6e0] px-4 py-4 text-base font-semibold hover:bg-[#f8f7f4] text-center";
  return (
    <div className="border-t border-[#f0ede8] pt-5 mb-5 space-y-3">
      <p className="text-sm font-semibold">Book another {appointmentWord}</p>
      <button type="button" onClick={() => go("same")} className={cls}>For me, on another date</button>
      <button type="button" onClick={() => go("other")} className={cls}>For someone else</button>
      <p className="text-xs text-[#6b6b80]">Each one is a separate booking with its own payment.</p>
    </div>
  );
}
