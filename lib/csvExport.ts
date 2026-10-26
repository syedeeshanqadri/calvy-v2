// Every CSV download is built on the server, behind the plan's CSV export flag. Nothing is generated
// in the browser from data already on the page, so a locked plan has nothing to download.
import { NextResponse } from "next/server";
import { checkLimit, denialResponse } from "@/lib/limits";
import { csvCell } from "@/lib/csv";
import { rateLimit } from "@/lib/ratelimit";

/**
 * The gate for every export route: the plan's CSV flag (read through the plan helper, so
 * PLAN_ENFORCEMENT applies) and a per-business rate limit. Returns the refusal, or null to go on.
 */
export async function guardCsvExport(businessId: string): Promise<NextResponse | null> {
  const denied = await checkLimit(businessId, "csv", { owner: true });
  if (denied) return denialResponse(denied);
  const rl = await rateLimit(`export:${businessId}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many exports. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  return null;
}

export type CsvValue = string | number | null | undefined;
export interface CsvColumn { header: string; phone?: boolean }

/** A CSV attachment (formula-safe cells, CRLF lines). */
export function csvResponse(filename: string, columns: CsvColumn[], rows: CsvValue[][]): NextResponse {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(","),
    ...rows.map((r) => r.map((v, i) => csvCell(v, { phone: columns[i]?.phone })).join(",")),
  ];
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
