import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { deletionRequests, GRACE_DAYS } from "@/lib/accountDeletion";
import { DeletionActions } from "./DeletionActions";

export const dynamic = "force-dynamic";
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Customers: account-deletion requests. A request is "Deletion pending" for 30 days, then the nightly job anonymises the person. */
export default async function AdminCustomersPage() {
  await requireAdminPage();
  const rows = await deletionRequests(prisma);
  const pending = rows.filter((r) => r.status === "PENDING");
  const history = rows.filter((r) => r.status !== "PENDING");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-syne text-2xl font-bold">Customers</h1>
        <p className="text-sm text-[#6b6b80] mt-1">Customers who asked to delete their account. They wait {GRACE_DAYS} days and can cancel; then the nightly job anonymises them (name, email, phone, login and referral codes removed; businesses keep their booking records). You can process or cancel a request earlier. Business owner accounts are not part of this.</p>
      </div>
      <section aria-label="Deletion pending" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">Deletion pending ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-[#6b6b80]">No pending requests.</p>}
        {pending.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-amber-200 p-4 space-y-2 text-sm">
            <p><span className="inline-block rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 mr-2">Deletion pending</span><strong>{r.email}</strong> · {r.name}</p>
            <p className="text-[#4b4b5e]">Asked {day(r.requestedAt)} · deleted on {day(r.executeAfter)}{r.upcomingCount > 0 ? ` · has ${r.upcomingCount} upcoming booking(s): it cannot be processed until they are done` : ""}</p>
            <DeletionActions id={r.id} blocked={r.upcomingCount > 0} />
          </div>
        ))}
      </section>
      <section aria-label="History" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">Recent history</h2>
        {history.length === 0 && <p className="text-sm text-[#6b6b80]">Nothing yet.</p>}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] divide-y divide-[#e8e6e0]">
          {history.map((r) => (
            <div key={r.id} className="p-3 text-sm flex flex-wrap justify-between gap-2">
              <span>{r.status === "DONE" ? "Anonymised" : "Cancelled"} · {r.email ?? "Deleted customer"}</span>
              <span className="text-[#4b4b5e]">{day(r.processedAt)} · {r.processedBy}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
