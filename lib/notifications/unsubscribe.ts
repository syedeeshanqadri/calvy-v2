export interface UnsubscribeLink { businessId: string; recipient: string }

/**
 * Read and check the `b` (business), `e` (base64url address) and `s` (signature) of an unsubscribe link.
 * Anything malformed, oversized or badly signed is just null: the caller gives one answer for all of it.
 */
export function parseUnsubscribeParams(
  params: URLSearchParams,
  isValid: (businessId: string, recipient: string, signature: string) => boolean,
): UnsubscribeLink | null {
  const b = params.get("b") ?? "";
  const e = params.get("e") ?? "";
  const s = params.get("s") ?? "";
  if (!b || b.length > 64 || !e || e.length > 400 || !s || s.length > 100) return null;
  const recipient = Buffer.from(e, "base64url").toString("utf8").trim().toLowerCase();
  if (!recipient || recipient.length > 254 || !recipient.includes("@")) return null;
  try {
    return isValid(b, recipient, s) ? { businessId: b, recipient } : null;
  } catch {
    return null; // no signing key configured: nothing can be valid
  }
}
