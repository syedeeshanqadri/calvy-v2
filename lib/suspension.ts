import { NextResponse } from "next/server";

/**
 * A suspended business takes no NEW bookings; its existing bookings, reminders and customer self-service carry on, and nobody
 * is emailed about the suspension. Public pages show a plain "temporarily unavailable"; the owner sees a notice in the dashboard.
 */
export const suspended = (b: { suspendedAt?: Date | null } | null | undefined): boolean => !!b?.suspendedAt;

export function suspendedResponse(name: string): NextResponse {
  return NextResponse.json({ error: `${name} isn't taking new bookings right now. Please try again later.`, code: "BUSINESS_SUSPENDED" }, { status: 503 });
}
