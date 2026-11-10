// Team permissions. Pure (no DB, no session) so the rules are unit-tested.
// Owner-only areas (billing/plan, team management, payment settings, WhatsApp credentials,
// delete business) are deliberately NOT permissions: they cannot be ticked for anyone.

export const PERMISSIONS = [
  "appointments.view_all",
  "appointments.view_own",
  "appointments.write",
  "appointments.cancel",
  "queue.control",
  "calendar.manage",
  "customers.view",
  "customers.edit",
  "customers.export",
  "services.manage",
  "website.edit",
  "reviews.settings",
  "notifications.settings",
  "reports.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string }[] }[] = [
  {
    title: "Appointments",
    items: [
      { key: "appointments.view_all", label: "View all appointments" },
      { key: "appointments.view_own", label: "View own appointments only" },
      { key: "appointments.write", label: "Create and edit appointments" },
      { key: "appointments.cancel", label: "Cancel appointments" },
    ],
  },
  { title: "Token queue", items: [{ key: "queue.control", label: "Control the token queue" }] },
  { title: "Calendar", items: [{ key: "calendar.manage", label: "Calendar and schedules (time off, hours)" }] },
  {
    title: "Customers",
    items: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.edit", label: "Add and edit customers" },
      { key: "customers.export", label: "Export customers (CSV)" },
    ],
  },
  { title: "Services", items: [{ key: "services.manage", label: "Manage services" }] },
  { title: "Website", items: [{ key: "website.edit", label: "Website editor" }] },
  {
    title: "Settings",
    items: [
      { key: "reviews.settings", label: "Reviews settings" },
      { key: "notifications.settings", label: "Notifications settings" },
    ],
  },
  { title: "Reports", items: [{ key: "reports.view", label: "Reports and analytics" }] },
];

/** Presets only pre-tick boxes in the form; nothing about a preset is stored. */
export const PRESETS: Record<string, { label: string; permissions: Permission[] }> = {
  receptionist: {
    label: "Receptionist",
    permissions: ["appointments.view_all", "appointments.write", "appointments.cancel", "queue.control", "calendar.manage", "customers.view", "customers.edit"],
  },
  practitioner: {
    label: "Practitioner",
    permissions: ["appointments.view_own", "appointments.write", "customers.view"],
  },
};

const VALID = new Set<string>(PERMISSIONS);

/** Keep only known permission keys, de-duplicated. Unknown strings (e.g. "billing") are dropped. */
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((p): p is Permission => typeof p === "string" && VALID.has(p)))];
}

export function can(perms: readonly string[] | ReadonlySet<string>, needed: Permission | readonly Permission[]): boolean {
  const has = (p: string) => (perms instanceof Set ? perms.has(p) : (perms as readonly string[]).includes(p));
  return (Array.isArray(needed) ? needed : [needed]).some((n) => has(n));
}

/** Path group -> permissions that open it (any of). Anything not listed is owner-only. */
export const ROUTE_PERMISSIONS: { prefix: string; any: Permission[] }[] = [
  { prefix: "/dashboard/appointments", any: ["appointments.view_all", "appointments.view_own"] },
  { prefix: "/dashboard/queue", any: ["queue.control"] },
  { prefix: "/dashboard/calendar", any: ["calendar.manage", "appointments.view_all", "appointments.view_own"] },
  { prefix: "/dashboard/clients", any: ["customers.view"] },
  { prefix: "/dashboard/services", any: ["services.manage"] },
  { prefix: "/dashboard/website", any: ["website.edit"] },
  { prefix: "/dashboard/analytics", any: ["reports.view"] },
  { prefix: "/dashboard/settings/notifications", any: ["notifications.settings"] },
];

/** Personal pages every signed-in person (owner or member) may open: their own phone alerts. */
export const ALWAYS_OPEN: readonly string[] = ["/dashboard/alerts"];

/** Pages a member may open; "/dashboard" itself is always fine (a landing screen). */
export function pathAllowed(perms: readonly string[], pathname: string): boolean {
  if (pathname === "/dashboard" || ALWAYS_OPEN.includes(pathname)) return true;
  const rule = ROUTE_PERMISSIONS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return !!rule && can(perms, rule.any);
}

/** The own-only rule: view_all wins; with only view_own the member sees appointments of their linked staff record. */
export type AppointmentScope = { kind: "all" } | { kind: "own"; staffId: string | null } | { kind: "none" };
export function appointmentScope(perms: readonly string[], staffId: string | null): AppointmentScope {
  if (perms.includes("appointments.view_all")) return { kind: "all" };
  if (perms.includes("appointments.view_own")) return { kind: "own", staffId };
  return { kind: "none" };
}

/** Thrown when a signed-in user lacks a permission; safeRoute answers it with 403. */
export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
