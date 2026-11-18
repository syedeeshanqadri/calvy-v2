import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimitStatus } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Liveness + database reachability for uptime monitors. Returns no secrets,
// versions or configuration, only up/down.
async function GET_handler() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Names only, no secrets: a missing Upstash is reported as a warning, never as down.
    const rl = rateLimitStatus();
    return NextResponse.json({ status: "ok", db: "up", rateLimit: rl.shared ? "shared" : "memory", ...(rl.warning ? { warnings: [rl.warning] } : {}) }, { headers });
  } catch (err) {
    logger.error("health check: database unreachable", { err });
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503, headers });
  }
}

export const GET = safeRoute(GET_handler);
