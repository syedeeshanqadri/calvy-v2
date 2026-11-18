import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// PayU, CCAvenue and Paytm send the customer back with a POST. This turns it into a normal page visit (303) on the booking
// return page, which re-checks the order with the gateway. Nothing in the POST body is trusted or read.
const ORDER = /^[A-Za-z0-9_-]{1,64}$/;

function back(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("order_id") ?? "";
  const target = new URL("/booking/return", req.nextUrl.origin);
  if (ORDER.test(id)) target.searchParams.set("order_id", id);
  return NextResponse.redirect(target, 303);
}

export const POST = back;
export const GET = back;
