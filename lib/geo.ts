import { isIP } from "net";

const TZ_CURRENCY: Record<string, string> = {
  "Asia/Kolkata": "INR", "Asia/Calcutta": "INR",
  "Asia/Karachi": "PKR",
  "Asia/Dhaka": "BDT",
  "Asia/Dubai": "AED", "Asia/Muscat": "AED",
  "Asia/Riyadh": "SAR", "Asia/Kuwait": "SAR", "Asia/Bahrain": "SAR",
  "Asia/Qatar": "QAR",
  "Europe/London": "GBP", "Europe/Dublin": "GBP",
  "Asia/Tokyo": "JPY",
  "Asia/Shanghai": "CNY", "Asia/Chongqing": "CNY",
  "Asia/Hong_Kong": "HKD",
  "Asia/Singapore": "SGD",
  "Asia/Kuala_Lumpur": "MYR",
  "Australia/Sydney": "AUD", "Australia/Melbourne": "AUD",
  "Australia/Brisbane": "AUD", "Australia/Perth": "AUD",
  "America/Toronto": "CAD", "America/Vancouver": "CAD",
  "America/Winnipeg": "CAD", "America/Halifax": "CAD",
  "Africa/Lagos": "NGN",
  "Africa/Nairobi": "KES",
  "Africa/Accra": "GHS",
  "America/Sao_Paulo": "BRL", "America/Manaus": "BRL",
  "America/Mexico_City": "MXN", "America/Monterrey": "MXN",
  "Africa/Johannesburg": "ZAR",
  "Africa/Cairo": "EGP",
  "Europe/Istanbul": "TRY",
  "Asia/Manila": "PHP",
  "Asia/Jakarta": "IDR", "Asia/Makassar": "IDR",
  "Asia/Bangkok": "THB",
  "Asia/Ho_Chi_Minh": "VND", "Asia/Saigon": "VND",
  "Europe/Zurich": "CHF",
  "Europe/Stockholm": "SEK",
  "Europe/Oslo": "NOK",
  "Europe/Copenhagen": "DKK",
  "Europe/Warsaw": "PLN",
  "Asia/Seoul": "KRW",
  "Asia/Taipei": "TWD",
  "America/Argentina/Buenos_Aires": "ARS",
  "America/Bogota": "COP",
  "America/Lima": "PEN",
  "America/Santiago": "CLP",
};

const EUR_ZONES = new Set([
  "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
  "Europe/Amsterdam", "Europe/Brussels", "Europe/Vienna", "Europe/Athens",
  "Europe/Lisbon", "Europe/Helsinki", "Europe/Prague", "Europe/Budapest",
  "Europe/Bucharest", "Europe/Sofia", "Europe/Zagreb", "Europe/Tallinn",
  "Europe/Riga", "Europe/Vilnius", "Europe/Bratislava", "Europe/Ljubljana",
  "Europe/Luxembourg", "Europe/Nicosia", "Europe/Malta", "Atlantic/Azores",
]);

export function getCurrencyFromTimezone(timezone: string): string {
  if (TZ_CURRENCY[timezone]) return TZ_CURRENCY[timezone];
  if (EUR_ZONES.has(timezone) || timezone.startsWith("Europe/")) return "EUR";
  return "USD";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
  AED: "د.إ", SAR: "﷼", PKR: "₨", INR: "₹", CAD: "C$",
  AUD: "A$", SGD: "S$", MYR: "RM ", BDT: "৳", NGN: "₦",
  KES: "KSh", GHS: "₵", TRY: "₺", BRL: "R$", MXN: "$",
  ZAR: "R", EGP: "£", QAR: "QR ", KWD: "KD ", OMR: "OMR ",
  CHF: "Fr", SEK: "kr", NOK: "kr", DKK: "kr", PLN: "zł",
  PHP: "₱", IDR: "Rp", THB: "฿", VND: "₫",
};

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

export async function getCurrencyFromIp(ip: string): Promise<string> {
  if (!ip || !isIP(ip) || ip === "127.0.0.1" || ip === "::1") return "USD"; // only a real IP address ever goes into the lookup URL
  try {
    const res = await fetch(`https://ipapi.co/${ip}/currency/`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return "USD";
    const currency = (await res.text()).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return "USD";
    return currency;
  } catch {
    return "USD";
  }
}

/** Two-letter country code for an IP, or null. Short timeout: this runs on a page request. */
export async function getCountryFromIp(ip: string, timeoutMs = 1500): Promise<string | null> {
  if (!ip || !isIP(ip) || ip === "127.0.0.1" || ip === "::1") return null; // only a real IP address ever goes into the lookup URL
  try {
    const res = await fetch(`https://ipapi.co/${ip}/country/`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const country = (await res.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(country) ? country : null;
  } catch {
    return null;
  }
}

export async function getExchangeRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return 1;
    const data = await res.json();
    return (data.rates?.[currency] as number) ?? 1;
  } catch {
    return 1;
  }
}

export function formatPrice(usdPrice: number, rate: number, currency: string): string {
  if (usdPrice === 0) return "Free";
  const symbol = getCurrencySymbol(currency);
  const converted = usdPrice * rate;
  let rounded: number;
  if (converted < 5) {
    rounded = Math.round(converted * 10) / 10;
  } else if (converted < 50) {
    rounded = Math.round(converted);
  } else if (converted < 500) {
    rounded = Math.round(converted / 5) * 5;
  } else {
    rounded = Math.round(converted / 50) * 50;
  }
  return `${symbol}${rounded}`;
}
