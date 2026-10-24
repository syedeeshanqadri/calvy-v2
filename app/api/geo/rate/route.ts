import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getExchangeRate } from "@/lib/geo";

export const dynamic = "force-dynamic";

async function GET_handler(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency") ?? "USD";
  if (!/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ rate: 1 });
  }
  const rate = await getExchangeRate(currency);
  return NextResponse.json({ rate }, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}

export const GET = safeRoute(GET_handler);
