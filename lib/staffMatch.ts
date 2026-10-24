// Which staff / services a customer can pick on the public booking page.
// Mirrors the server rule (staff linked to ALL selected services) so the UI
// never offers a provider the API would refuse.

export interface MatchStaff {
  id: string;
  serviceIds: string[];
}

/** Staff who perform every selected service. With no selection, nobody is filtered out. */
export function qualifiedStaff<T extends MatchStaff>(staff: T[], selectedServiceIds: string[]): T[] {
  return staff.filter((s) => selectedServiceIds.every((id) => s.serviceIds.includes(id)));
}

/**
 * Services someone can actually perform. A business with no active staff has one
 * shared calendar, so everything stays bookable.
 */
export function bookableServices<S extends { id: string }>(services: S[], staff: MatchStaff[]): S[] {
  if (staff.length === 0) return services;
  return services.filter((svc) => staff.some((m) => m.serviceIds.includes(svc.id)));
}

/** What the provider step should show for the current selection. */
export function providerOptions<T extends MatchStaff>(
  staff: T[],
  selectedServiceIds: string[],
): { kind: "none" } | { kind: "choose"; staff: T[]; offerNoPreference: boolean } | { kind: "shared" } {
  if (staff.length === 0) return { kind: "shared" }; // no staff configured: nothing to choose
  const ok = qualifiedStaff(staff, selectedServiceIds);
  if (ok.length === 0) return { kind: "none" };
  return { kind: "choose", staff: ok, offerNoPreference: true };
}
