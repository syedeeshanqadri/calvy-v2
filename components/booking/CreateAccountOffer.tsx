import Link from "next/link";

/** After a booking: an optional invitation to track bookings in an account. Guests never need one. */
export function CreateAccountOffer({ email }: { email: string }) {
  const href = `/my/signup${email ? `?email=${encodeURIComponent(email)}` : ""}`;
  return (
    <div className="border-t border-[#f0ede8] pt-5 mb-5 text-left space-y-2">
      <p className="text-sm font-semibold">Track your bookings</p>
      <p className="text-xs text-[#6b6b80]">Optional: create a free account to see your appointments, tokens and wallet in one place.</p>
      <Link href={href} className="block w-full min-h-11 rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm font-semibold text-center hover:bg-[#f8f7f4]">
        Create an account to track bookings
      </Link>
    </div>
  );
}
