/**
 * PLACEHOLDER for the "online consultation" badge. Services have no online flag yet, so a service counts as
 * online when its name or description says so. When online consultations ship as a real setting, replace
 * this with that field; the badge components do not need to change.
 */
const ONLINE_WORDS = /\b(online|video|virtual|tele-?(?:health|medicine|consult\w*)|zoom|remote)\b/i;

export function isOnlineService(svc: { name: string; description?: string | null }): boolean {
  return ONLINE_WORDS.test(svc.name) || ONLINE_WORDS.test(svc.description ?? "");
}
