import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/auth";
import { loadBusinessDetail } from "@/lib/admin/businessDetail";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { isFeatureEnabled } from "@/lib/flags";
import { formatCurrencyAmount } from "@/lib/currency";
import { BusinessActions } from "./BusinessActions";

export const dynamic = "force-dynamic";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5"><h2 className="font-syne font-semibold text-[15px] mb-3">{title}</h2>{children}</section>;
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-[#f5f3ef] last:border-0"><dt className="text-[#6b6b80]">{k}</dt><dd className="text-right break-all">{v}</dd></div>;
}

export default async function AdminBusinessPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage();
  const { id } = await props.params;
  const d = await loadBusinessDetail(id);
  if (!d) notFound();
  const { business: b } = d;
  const limits = await getEffectiveLimits({ plan: b.plan, planStatus: b.planStatus });

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/businesses" className="text-xs text-[#6b6b80] hover:underline">← Businesses</Link>
          <h1 className="font-syne font-bold text-2xl mt-1">{b.name} {b.suspendedAt && <span className="ml-2 text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full align-middle">Suspended</span>}</h1>
          <p className="text-sm text-[#6b6b80]">{b.slug} · {b.packId} · {b.region} · signed up {ymd(b.createdAt).slice(0, 10)}</p>
        </div>
      </div>

      <BusinessActions business={{ id: b.id, name: b.name, phone: b.phone ?? "", email: b.email ?? "", address: b.address ?? "", website: b.website ?? "", description: b.description ?? "", suspended: !!b.suspendedAt, plan: b.plan, overridePlan: b.planOverridePlan, overrideUntil: b.planOverrideUntil?.toISOString().slice(0, 10) ?? null, ownerHasPassword: d.owner.emailVerified != null }} viewAsActive={!!ctx.viewAs} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Profile">
          <dl>
            <Row k="Owner" v={`${d.owner.name} · ${d.owner.email}${d.owner.emailVerified ? "" : " (not verified)"}`} />
            <Row k="Phone" v={b.phone ?? "—"} /><Row k="Business email" v={b.email ?? "—"} /><Row k="Address" v={b.address ?? "—"} /><Row k="Website" v={b.website ?? "—"} />
            <Row k="Currency · timezone" v={`${b.currency} · ${b.timezone}`} /><Row k="Booking mode" v={b.bookingMode} />
            <Row k="Setup" v={b.onboardingCompletedAt ? "Complete" : `Wizard step ${b.onboardingStep}`} />
            <Row k="Counts" v={`${d.counts.appointments} bookings · ${d.counts.clients} customers · ${d.counts.staff} staff`} />
          </dl>
        </Section>

        <Section title="Plan and payments (read-only)">
          <dl>
            <Row k="Plan" v={`${b.plan} (${b.planStatus})`} />
            <Row k="Override" v={b.planOverridePlan ? `${b.planOverridePlan} until ${b.planOverrideUntil ? b.planOverrideUntil.toISOString().slice(0, 10) : "cleared by an admin"} · was ${b.planOverrideFromPlan}` : "None"} />
            <Row k="Online payments" v={isFeatureEnabled("onlinePayments") ? "On" : "Off"} />
            <Row k="Mode · fee payer" v={`${b.onlinePayMode} · ${b.feePayer}`} />
            <Row k="Calvy booking fee" v={limits.platformFeeMinorIN > 0 ? formatCurrencyAmount(limits.platformFeeMinorIN / 100, "INR") : "None on this plan"} />
            <Row k="Bank, PAN, gateway account" v="Hidden from admins" />
          </dl>
        </Section>

        <Section title={`Team (${d.team.length})`}>
          {d.team.length === 0 ? <p className="text-sm text-[#6b6b80]">Owner only.</p> : <ul className="text-sm space-y-1">{d.team.map((m) => <li key={m.email}>{m.name} · {m.roleName} · {m.email}{m.userId ? "" : " (invited)"}</li>)}</ul>}
        </Section>

        <Section title={`Services (${d.services.length})`}>
          <ul className="text-sm space-y-1">{d.services.map((s) => <li key={s.id} className="flex justify-between"><span>{s.name}</span><span className="text-[#6b6b80]">{s.duration} min · {formatCurrencyAmount(s.price, b.currency)}</span></li>)}</ul>
        </Section>

        <Section title="Recent bookings">
          <ul className="text-sm space-y-1">{d.bookings.map((a) => <li key={a.id} className="flex justify-between gap-3"><span>{ymd(a.date)} · {a.service} · {a.client}</span><span className="text-[#6b6b80]">{a.status}{a.paymentStatus === "paid" ? " · paid" : ""}</span></li>)}{d.bookings.length === 0 && <li className="text-[#6b6b80]">None yet</li>}</ul>
        </Section>

        <Section title="Delivery log (latest 20)">
          <ul className="text-sm space-y-1">{d.deliveries.map((n) => <li key={n.id} className="flex justify-between gap-3"><span>{ymd(n.createdAt)} · {n.template} · {n.channel.toLowerCase()} · {n.recipient}</span><span className={n.status === "FAILED" ? "text-red-700 font-semibold" : "text-[#6b6b80]"}>{n.status.toLowerCase()}</span></li>)}{d.deliveries.length === 0 && <li className="text-[#6b6b80]">Nothing sent yet</li>}</ul>
        </Section>
      </div>

      <Section title="Audit trail">
        <div className="grid lg:grid-cols-2 gap-6">
          <div><h3 className="text-xs font-semibold uppercase tracking-wider text-[#6b6b80] mb-2">Calvy admin actions</h3>
            <ul className="text-sm space-y-1.5">{d.adminAudit.map((a) => <li key={a.id}><b>{a.action}</b> · {ymd(a.createdAt)} · {a.adminEmail}{a.reason ? <span className="block text-xs text-[#6b6b80]">“{a.reason}”</span> : null}</li>)}{d.adminAudit.length === 0 && <li className="text-[#6b6b80]">None</li>}</ul></div>
          <div><h3 className="text-xs font-semibold uppercase tracking-wider text-[#6b6b80] mb-2">Business activity log</h3>
            <ul className="text-sm space-y-1.5">{d.ownerAudit.map((a) => <li key={a.id}><b>{a.action}</b> · {ymd(a.createdAt)} · {a.actorId === "calvy-admin" ? "Calvy admin" : "team"}{a.target ? ` · ${a.target}` : ""}</li>)}{d.ownerAudit.length === 0 && <li className="text-[#6b6b80]">None</li>}</ul></div>
        </div>
      </Section>
    </div>
  );
}
