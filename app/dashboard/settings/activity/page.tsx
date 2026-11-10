import { pageAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  "team.member_added": "Added a team member", "team.member_removed": "Removed a team member", "team.permissions_changed": "Changed a team member's access",
  "team.invite_resent": "Re-sent a team invite", "team.invite_revoked": "Revoked a team invite", "team.invite_accepted": "A team member accepted an invite",
  "settings.payments_changed": "Changed online payment settings", "admin.edit": "Changed",
};

/** Owner only: what changed in this account and who did it. When Calvy support edits something while helping, it shows here as "Calvy admin". */
export default async function ActivityPage() {
  const session = await pageAccess("owner");
  const rows = await prisma.auditLog.findMany({ where: { businessId: session.user.businessId }, orderBy: { createdAt: "desc" }, take: 100 });
  const ids = [...new Set(rows.map((r) => r.actorId).filter((a) => a !== "calvy-admin"))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.name]));

  return (
    <DashboardLayout title="Account activity" subtitle="Who changed what in your account">
      <div className="max-w-3xl">
        <Card>
          <CardHeader><CardTitle>Latest 100 changes</CardTitle></CardHeader>
          <CardContent>
            {rows.length === 0 ? <p className="text-sm text-[#6b6b80]">Nothing yet.</p> : (
              <ul className="divide-y divide-[#f0ede8]">
                {rows.map((r) => {
                  const byAdmin = r.actorId === "calvy-admin";
                  const reason = byAdmin && r.detail ? (() => { try { return (JSON.parse(r.detail) as { reason?: string }).reason; } catch { return undefined; } })() : undefined;
                  return (
                    <li key={r.id} className="py-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span><b>{byAdmin ? "Calvy admin" : name.get(r.actorId) ?? "Team member"}</b> · {LABEL[r.action] ?? r.action}{r.action === "admin.edit" && r.target ? ` ${r.target}` : ""}</span>
                        <time className="text-xs text-[#6b6b80] whitespace-nowrap" dateTime={r.createdAt.toISOString()}>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</time>
                      </div>
                      {reason && <p className="text-xs text-[#6b6b80] mt-0.5">Support reason: {reason}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
