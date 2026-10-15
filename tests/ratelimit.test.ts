import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter, clientIp, type RedisLike } from "@/lib/ratelimit";

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** Fake Redis implementing the INCR+PEXPIRE script semantics. */
function fakeRedis() {
  const store = new Map<string, number>();
  const pexpire: Array<{ key: string; ms: string }> = [];
  const redis: RedisLike = {
    async eval(_script, keys, args) {
      const key = keys[0];
      const c = (store.get(key) ?? 0) + 1;
      store.set(key, c);
      if (c === 1) pexpire.push({ key, ms: args[0] });
      return c;
    },
  };
  return { redis, store, pexpire };
}

describe("in-memory limiter", () => {
  it("allows up to the limit then blocks within the window", async () => {
    const clock = fakeClock();
    const rateLimit = createRateLimiter({ now: clock.now });
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit("k", 3, 60_000)).ok).toBe(true);
    }
    const blocked = await rateLimit("k", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(60);
    clock.advance(20_000);
    expect((await rateLimit("k", 3, 60_000)).retryAfter).toBe(40);
  });

  it("tracks separate keys independently", async () => {
    const rateLimit = createRateLimiter({ now: fakeClock().now });
    expect((await rateLimit("a", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("a", 1, 60_000)).ok).toBe(false);
    expect((await rateLimit("b", 1, 60_000)).ok).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const clock = fakeClock();
    const rateLimit = createRateLimiter({ now: clock.now });
    expect((await rateLimit("k", 1, 1000)).ok).toBe(true);
    expect((await rateLimit("k", 1, 1000)).ok).toBe(false);
    clock.advance(1001);
    expect((await rateLimit("k", 1, 1000)).ok).toBe(true);
  });

  it("treats an already-expired window as reset on every call", async () => {
    const rateLimit = createRateLimiter({ now: fakeClock().now });
    expect((await rateLimit("k", 1, -1)).ok).toBe(true);
    expect((await rateLimit("k", 1, -1)).ok).toBe(true);
  });
});

describe("redis limiter", () => {
  it("increments, sets expiry once, and flips ok after the limit", async () => {
    const clock = fakeClock(120_000); // aligned to the start of a 60s window
    const { redis, store, pexpire } = fakeRedis();
    const rateLimit = createRateLimiter({ redis, now: clock.now });

    for (let i = 0; i < 3; i++) {
      expect((await rateLimit("login:x", 3, 60_000)).ok).toBe(true);
    }
    clock.advance(15_000);
    const blocked = await rateLimit("login:x", 3, 60_000);
    expect(blocked).toEqual({ ok: false, retryAfter: 45 });

    expect(store.get("rl:login:x:120000")).toBe(4);
    expect(pexpire).toEqual([{ key: "rl:login:x:120000", ms: "60000" }]);
  });

  it("rolls over to a fresh counter in the next window", async () => {
    const clock = fakeClock(120_000);
    const { redis, store, pexpire } = fakeRedis();
    const rateLimit = createRateLimiter({ redis, now: clock.now });

    expect((await rateLimit("k", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("k", 1, 60_000)).ok).toBe(false);
    clock.advance(60_000);
    expect((await rateLimit("k", 1, 60_000)).ok).toBe(true);
    expect(Array.from(store.keys()).sort()).toEqual(["rl:k:120000", "rl:k:180000"]);
    expect(pexpire).toHaveLength(2);
  });

  it("falls back to in-memory (and does not throw) when redis fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const redis: RedisLike = { eval: async () => { throw new Error("boom"); } };
    const rateLimit = createRateLimiter({ redis, now: fakeClock().now });

    expect((await rateLimit("secret-key-value", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("secret-key-value", 1, 60_000)).ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-key-value");
    warn.mockRestore();
  });

  it("falls back when redis times out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const redis: RedisLike = { eval: () => new Promise(() => {}) };
    const rateLimit = createRateLimiter({ redis, redisTimeoutMs: 20 });
    expect((await rateLimit("t", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("t", 1, 60_000)).ok).toBe(false);
    warn.mockRestore();
  });
});

describe("lazy redis construction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });

  it("does not instantiate a client on import or without env vars", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const ctor = vi.fn();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({ Redis: ctor }));
    const mod = await import("@/lib/ratelimit");
    expect(ctor).not.toHaveBeenCalled();
    expect((await mod.rateLimit(`lazy:${Math.random()}`, 1, 60_000)).ok).toBe(true);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("builds the client only on first use when both vars are set", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    const evalFn = vi.fn().mockResolvedValue(1);
    const ctor = vi.fn(function () { return { eval: evalFn }; });
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({ Redis: ctor }));
    const mod = await import("@/lib/ratelimit");
    expect(ctor).not.toHaveBeenCalled();
    await mod.rateLimit("x", 5, 60_000);
    await mod.rateLimit("x", 5, 60_000);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(evalFn).toHaveBeenCalledTimes(2);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip then 'unknown'", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
