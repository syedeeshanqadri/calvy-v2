import { pageAccess } from "@/lib/access";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PREF_FIELDS, PREF_LABELS, KIND_PREF, PUSH_KINDS, mayReceive, type PrefField } from "@/lib/pushRouting";
import { AlertsClient } from "./AlertsClient";

export const dynamic = "force-dynamic";

/** Personal phone alerts: any signed-in person, owner or team member. Only the kinds their access allows are offered. */
export default async function AlertsPage() {
  const session = await pageAccess();
  const r = { isOwner: session.access.isOwner, permissions: session.access.permissions, staffId: session.access.staffId };
  // For "own appointments only" members, booking alerts are offered (they get their own bookings).
  const offered: PrefField[] = PREF_FIELDS.filter((f) =>
    PUSH_KINDS.some((k) => KIND_PREF[k] === f && mayReceive(k, r, r.staffId ?? "own")),
  );
  return (
    <DashboardLayout title="Phone alerts" subtitle="Choose what buzzes this phone">
      <AlertsClient offered={offered.map((f) => ({ field: f, label: PREF_LABELS[f] }))} configured={!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
    </DashboardLayout>
  );
}
