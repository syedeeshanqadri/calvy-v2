// Error handling shared by every API route: a thrown error becomes a JSON body
// with a readable message and the right status, never an empty 500.
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import type { WriteTrace } from "@/lib/admin/guard";
import { ForbiddenError } from "@/lib/permissions";

interface ErrorLike { code?: unknown; name?: unknown; digest?: unknown }

const DB_UNAVAILABLE = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]);

/** Map an unexpected error to a safe JSON response. Prisma codes get a friendly message. */
export function errorResponse(err: unknown): NextResponse {
  const e = (err ?? {}) as ErrorLike;
  const code = typeof e.code === "string" ? e.code : "";

  if (DB_UNAVAILABLE.has(code)) {
    return NextResponse.json(
      { error: "The database took too long to respond. Nothing was changed, please try again in a moment.", code: "DB_UNAVAILABLE" },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  }
  if (code === "P2002") {
    return NextResponse.json({ error: "That already exists.", code: "DUPLICATE" }, { status: 409 });
  }
  if (code === "P2025") {
    return NextResponse.json({ error: "That record no longer exists. Refresh and try again.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (code === "P2003") {
    return NextResponse.json({ error: "That record is still in use by something else.", code: "IN_USE" }, { status: 409 });
  }
  return NextResponse.json({ error: "Something went wrong on our side. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
}

/**
 * Wrap a route handler so an uncaught exception is logged and answered with JSON.
 * Next's own control-flow errors (redirect, notFound) are re-thrown untouched.
 */
export function safeRoute<A extends unknown[], R extends Response>(handler: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R | NextResponse> => {
    try {
      // Calvy admin rules (read-only view-as, act-as and admin audit): see lib/admin/guard.ts. Free for normal traffic.
      const req = args[0] instanceof Request ? args[0] : null;
      let trace: WriteTrace | null = null;
      // Only a request that carries the admin cookie loads any of it (normal traffic pays nothing).
      const adminRequest = !!req && !["GET", "HEAD", "OPTIONS"].includes(req.method) && (req.headers.get("cookie") ?? "").includes("calvy_admin=");
      if (adminRequest) {
        const gate = await (await import("@/lib/admin/guard")).adminWriteGate(req!);
        if ("block" in gate) return gate.block;
        trace = gate.trace;
      }
      const res = await handler(...args);
      if (trace) await (await import("@/lib/admin/guard")).recordAdminWrite(trace, res.status);
      return res;
    } catch (err) {
      if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message, code: "FORBIDDEN" }, { status: 403 });
      const digest = (err as ErrorLike)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
      logger.error("[api] unhandled route error", { err });
      return errorResponse(err);
    }
  };
}
