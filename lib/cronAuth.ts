import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Fails closed: in production a missing CRON_SECRET rejects every call.
 * In non-production an unset secret is allowed so local/dev runs can hit the route.
 * When set, `Authorization: Bearer <secret>` is compared in constant time.
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(auth);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
