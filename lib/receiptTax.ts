import { formatCurrencyAmount } from "@/lib/currency";
import { logger } from "@/lib/logger";

/**
 * The receipt for Calvy's booking fee (pure apart from reading the environment). Calvy's company details come
 * from CALVY_LEGAL_NAME, CALVY_ADDRESS, CALVY_GSTIN and CALVY_GST_RATE; none of them is hard-coded and nothing is invented:
 * missing details are said so on the receipt, and with no GSTIN the receipt carries no GST line and says it is not a tax invoice.
 */
export interface ReceiptTax {
  /** Calvy's company details, or null while they are not configured. */
  issuer: { legalName: string; address: string; gstin: string | null } | null;
  /** The fee split into the amount before GST and the GST in it (only with a GSTIN). */
  split: { baseLabel: string; gstLabel: string; ratePercent: number } | null;
  /** One plain sentence under the receipt. */
  note: string;
  feeLabel: string;
}

type Env = Record<string, string | undefined>;

/** GST-inclusive amount (minor units) -> amount before GST and the GST in it. Rounds the base, so the two always add up. */
export function gstSplit(inclusiveMinor: number, ratePercent: number): { baseMinor: number; gstMinor: number } {
  const inc = Math.max(0, Math.round(inclusiveMinor));
  const baseMinor = Math.round((inc * 100) / (100 + Math.max(0, ratePercent)));
  return { baseMinor, gstMinor: inc - baseMinor };
}

const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

export function receiptTax(feeMinor: number, currency: string, env: Env = process.env): ReceiptTax {
  const legalName = clean(env.CALVY_LEGAL_NAME);
  const address = clean(env.CALVY_ADDRESS);
  const gstin = clean(env.CALVY_GSTIN).toUpperCase() || null;
  const rateRaw = Number(env.CALVY_GST_RATE ?? 18);
  const ratePercent = Number.isFinite(rateRaw) && rateRaw >= 0 && rateRaw <= 100 ? rateRaw : 18;
  const feeLabel = formatCurrencyAmount(feeMinor / 100, currency);

  const issuer = legalName && address ? { legalName, address, gstin } : null;
  if (!issuer) {
    logger.warn("[receipt] CALVY_LEGAL_NAME / CALVY_ADDRESS are not set: receipts go out without company details");
    return { issuer: null, split: null, note: "Receipt details not configured.", feeLabel };
  }
  if (!gstin) {
    return { issuer, split: null, note: "Receipt for the booking fee. This is not a tax invoice.", feeLabel };
  }
  const { baseMinor, gstMinor } = gstSplit(feeMinor, ratePercent);
  return {
    issuer,
    split: { baseLabel: formatCurrencyAmount(baseMinor / 100, currency), gstLabel: formatCurrencyAmount(gstMinor / 100, currency), ratePercent },
    note: `The booking fee includes GST at ${ratePercent}%.`,
    feeLabel,
  };
}
