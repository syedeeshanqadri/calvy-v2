import Link from "next/link";
import { z } from "zod";
import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE = 50;

const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === "" || v == null ? undefined : v), t.optional());
const schema = z.object({
  action: opt(z.string().max(60)), business: opt(z.string().max(64)), admin: opt(z.string().max(254)),
  from: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), to: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  page: z.preprocess((v) => Number(v) || 1, z.number().int().min(1).max(100_000)),
});
const field = "h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm";

/** Every admin action and every view-as session. Read-only by design: there is no edit or delete anywhere, and the database refuses both. */
export default async function AdminAuditPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const raw = await props.searchParams;
  const f = schema.catch(schema.parse({})).parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const where = {
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.business ? { businessId: f.business } : {}),
    ...(f.admin ? { adminEmail: { contains: f.admin, mode: "insensitive" as const } } : {}),
    ...((f.from || f.to) ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000) } : {}) } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * PAGE, take: PAGE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (page: number) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, page })) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v)); return `/admin/audit?${p}`; };

  return (
    <div className="p-8 space-y-6">
      <div><h1 className="font-syne font-bold text-2xl">Audit log</h1><p className="text-sm text-[#6b6b80]">{total} entries. Append-only: nothing here can be edited or deleted.</p></div>
      <form method="get" className="flex flex-wrap gap-2 items-end" aria-label="Filters">
        <select name="action" defaultValue={f.action ?? ""} className={field} aria-label="Action">
          <option value="">Any action</option>
          {["2fa", "reauth", "view_as", "act_as", "business", "settings", "admin.api"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input name="business" defaultValue={f.business} placeholder="Business id" className={`${field} w-48`} aria-label="Business id" />
        <input name="admin" defaultValue={f.admin} placeholder="Admin email" className={`${field} w-52`} aria-label="Admin email" />
        <label className="text-xs text-[#6b6b80]">From<input type="date" name="from" defaultValue={f.from} className={`${field} block`} /></label>
        <label className="text-xs text-[#6b6b80]">To<input type="date" name="to" defaultValue={f.to} className={`${field} block`} /></label>
        <button type="submit" className="h-10 px-4 rounded-xl border border-[#e8e6e0] bg-white text-sm font-semibold">Filter</button>
        <Link href="/admin/audit" className="h-10 px-2 inline-flex items-center text-sm text-[#6b6b80] hover:underline">Clear</Link>
      </form>
      <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-[#fafaf8] text-left text-xs text-[#6b6b80]">{["When (UTC)", "Admin", "Action", "Business", "Reason", "Detail"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#f0ede8] align-top">
                <td className="px-4 py-2 whitespace-nowrap text-[#6b6b80]">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="px-4 py-2">{r.adminEmail}</td>
                <td className="px-4 py-2 font-semibold">{r.action}</td>
                <td className="px-4 py-2">{r.businessId ? <Link href={`/admin/businesses/${r.businessId}`} className="underline">{r.businessId.slice(0, 8)}…</Link> : "—"}</td>
                <td className="px-4 py-2 max-w-xs">{r.reason ?? "—"}</td>
                <td className="px-4 py-2 max-w-xs break-all text-xs text-[#6b6b80]">{r.detail ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#6b6b80]">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav className="flex items-center justify-between text-sm" aria-label="Pages"><span className="text-[#6b6b80]">Page {f.page} of {pages}</span><span className="flex gap-2">{f.page > 1 && <Link href={qs(f.page - 1)} className="px-3 py-2 rounded-lg border border-[#e8e6e0] bg-white">Previous</Link>}{f.page < pages && <Link href={qs(f.page + 1)} className="px-3 py-2 rounded-lg border border-[#e8e6e0] bg-white">Next</Link>}</span></nav>
    </div>
  );
}
