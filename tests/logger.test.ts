import { describe, it, expect, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { formatLog, getRequestId, serializeError } from "@/lib/logger";
import { GET as health } from "@/app/api/health/route";

describe("logger", () => {
  it("emits one JSON line with level, time and message", () => {
    const line = JSON.parse(formatLog("info", "hello", { requestId: "r-1" }));
    expect(line).toMatchObject({ level: "info", msg: "hello", requestId: "r-1" });
    expect(typeof line.time).toBe("string");
  });

  it("redacts sensitive keys at any depth", () => {
    const line = formatLog("info", "x", {
      password: "hunter2",
      user: { email: "a@b.com", token: "abc", name: "ok" },
      headers: { authorization: "Bearer zzz", cookie: "s=1" },
      phone: "+15551234567",
      apiKey: "k",
    });
    for (const secret of ["hunter2", "a@b.com", "abc", "Bearer zzz", "s=1", "+15551234567"]) {
      expect(line).not.toContain(secret);
    }
    expect(JSON.parse(line).user.name).toBe("ok");
  });

  it("reduces errors to name and message", () => {
    const e = serializeError(new TypeError("boom"));
    expect(e).toMatchObject({ name: "TypeError", message: "boom" });
    expect(serializeError({ secret: "x" })).toEqual({ message: "non-error thrown" });
  });

  it("truncates very long strings", () => {
    const line = JSON.parse(formatLog("warn", "x", { big: "a".repeat(5000) }));
    expect(line.big.length).toBeLessThan(600);
  });

  it("reads the request id header", () => {
    expect(getRequestId({ headers: new Headers({ "x-request-id": "abc-123" }) })).toBe("abc-123");
    expect(getRequestId({ headers: new Headers() })).toBe("unknown");
  });
});

describe("GET /api/health", () => {
  it("200 and no secrets when the database answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "up" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("503 when the database is down, without leaking the error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED postgres://user:pw@host/db"));
    const res = await health();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("postgres");
    spy.mockRestore();
  });
});
