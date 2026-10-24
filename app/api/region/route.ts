import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/ratelimit";
import { getCountryFromIp } from "@/lib/geo";
import { resolveRegion, regionCookieString } from "@/lib/region";

export const dynamic = "force-dynamic";

// Display-only: tells the marketing pages which price list to show.
export async function GET(req: NextRequest) {
  const { region, source } = await resolveRegion({
    cookie: req.headers.get("cookie"),
    headers: req.headers,
    lookupCountry: () => getCountryFromIp(clientIp(req)),
  });
  const res = NextResponse.json({ region }, { headers: { "Cache-Control": "private, no-store" } });
  if (source !== "cookie") res.headers.append("Set-Cookie", regionCookieString(region));
  return res;
}
