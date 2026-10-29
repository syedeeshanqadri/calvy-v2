import Link from "next/link";
import { Wallet } from "lucide-react";
import { getCustomerData } from "@/lib/customerData";
import { PageHeader } from "@/components/my/PageHeader";
import { VerifyNotice } from "../MyClient";

export const dynamic = "force-dynamic";

export default async function MyWalletPage() {
  const data = await getCustomerData();
  if (!data) return null;
  if (!data.verified) {
    return (
      <>
        <PageHeader title="Wallet" />
        <VerifyNotice email={data.me.email} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Wallet" subtitle="Credit you can use on your next booking at the same business." />
      {data.wallets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-8 text-center max-w-xl">
          <span className="mx-auto h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center"><Wallet size={22} aria-hidden /></span>
          <p className="font-semibold mt-4">No credit yet</p>
          <p className="text-sm text-[#6b6b80] mt-1">If you cancel, or miss, a booking you paid for online, what you paid is saved here for your next visit to that business.</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4 max-w-3xl">
          {data.wallets.map((w) => (
            <li key={w.businessSlug} className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
              <p className="text-sm text-[#6b6b80]">{w.businessName}</p>
              <p className="font-syne font-bold text-2xl mt-1">{w.balanceLabel}</p>
              <Link href={`/${w.businessSlug}/book-now`} className="inline-flex mt-4 min-h-10 items-center rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-5">Book there</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
