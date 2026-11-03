import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ROUTE_PERMISSIONS, can, type Permission } from "@/lib/permissions";

const LABELS: Record<string, string> = {
  "/dashboard/appointments": "Appointments", "/dashboard/queue": "Token queue", "/dashboard/calendar": "Calendar",
  "/dashboard/clients": "Customers", "/dashboard/services": "Services", "/dashboard/website": "Website",
  "/dashboard/analytics": "Reports", "/dashboard/settings/notifications": "Notification settings",
};

/** What a team member lands on: only the areas their permissions open. */
export function MemberHome({ name, roleName, permissions }: { name: string; roleName: string; permissions: Permission[] }) {
  const links = ROUTE_PERMISSIONS.filter((r) => can(permissions, r.any));
  return (
    <DashboardLayout title={`Hello, ${name.split(" ")[0] || "there"}`} subtitle={roleName}>
      {links.length === 0 ? (
        <p className="text-sm text-[#6b6b80]" data-testid="member-empty">No areas have been enabled for you yet. Ask the business owner to update your access.</p>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl" data-testid="member-links">
          {links.map((r) => (
            <li key={r.prefix}>
              <Link href={r.prefix} className="block bg-white rounded-2xl border border-[#e8e6e0] p-5 text-sm font-medium hover:border-sky-300">{LABELS[r.prefix] ?? r.prefix}</Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardLayout>
  );
}
