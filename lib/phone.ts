// Phone numbers are stored in E.164 (+919876543210) so one person is one client
// however the number was typed. The default country code comes from the business
// timezone; keep the table in step with prisma/migrations/*_client_phone_unique.

const TZ_CALLING_CODE: Record<string, string> = {
  "Asia/Kolkata": "91",
  "Asia/Calcutta": "91",
  "Asia/Dubai": "971",
  "Asia/Karachi": "92",
  "Asia/Dhaka": "880",
  "Asia/Colombo": "94",
  "Asia/Kathmandu": "977",
  "Asia/Singapore": "65",
  "Asia/Riyadh": "966",
  "Europe/London": "44",
  "Europe/Berlin": "49",
  "Europe/Paris": "33",
  "Pacific/Auckland": "64",
  "Africa/Lagos": "234",
  "Africa/Nairobi": "254",
  "Africa/Johannesburg": "27",
  "America/Sao_Paulo": "55",
  "America/Mexico_City": "52",
};

/** Calling code (no plus) for a business timezone. Unknown zones use India's, the product default. */
export function callingCodeForTimezone(tz: string | null | undefined): string {
  if (!tz) return "91";
  if (TZ_CALLING_CODE[tz]) return TZ_CALLING_CODE[tz];
  if (tz.startsWith("America/")) return "1";
  if (tz.startsWith("Australia/")) return "61";
  return "91";
}

/**
 * Normalise a typed phone number to E.164, or null when it cannot be one
 * (empty, or not 8 to 15 digits). Spaces, dashes, dots and brackets are ignored.
 */
export function normalizePhone(raw: unknown, tz?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  const cc = callingCodeForTimezone(tz);

  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.length >= 11 && digits.startsWith(cc)) e164 = `+${digits}`;
  else e164 = `+${cc}${digits.replace(/^0+/, "")}`;

  const n = e164.length - 1;
  return n >= 8 && n <= 15 ? e164 : null;
}
