import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Liveness + database reachability for uptime monitors. Returns no secrets,
// versions or configuration, only up/down.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up" }, { headers });
  } catch (err) {
    logger.error("health check: database unreachable", { err });
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503, headers });
  }
}
