import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter, clientIp, type RedisLike } from "@/lib/ratelimit";

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms), set: (v: number) => void (t = v) };
}

function fakeRedis() {
  const store = new Map<string, number>();
  const redis: RedisLike = {
    async eval(_s, keys) {
      const c = (store.get(keys[0]) ?? 0) + 1;
      store.set(keys[0], c);
      return c;
    },
  };
  return { redis, store };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("window boundaries (memory)", () => {
  it("still blocked at exactly resetAt, allowed 1ms after", async () => {
    const clock = fakeClock();
    const rl = createRateLimiter({ now: clock.now });
    expect((await rl("k", 1, 1000)).ok).toBe(true);
    clock.advance(1000); // t === resetAt: implementation uses t > resetAt
    expect((await rl("k", 1, 1000)).ok).toBe(false);
    clock.advance(1);
    expect((await rl("k", 1, 1000)).ok).toBe(true);
  });

  it("limit 1 allows exactly one", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    expect((await rl("k", 1, 60_000)).ok).toBe(true);
    expect((await rl("k", 1, 60_000)).ok).toBe(false);
  });

  it("limit 0 and negative: first call in a fresh window is allowed (documented quirk), later ones blocked", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    expect((await rl("z", 0, 60_000)).ok).toBe(true); // quirk: new bucket always ok
    expect((await rl("z", 0, 60_000)).ok).toBe(false);
    expect((await rl("n", -5, 60_000)).ok).toBe(true);
    expect((await rl("n", -5, 60_000)).ok).toBe(false);
  });

  it("very large window works and retryAfter is large", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    const year = 365 * 24 * 3600 * 1000;
    await rl("big", 1, year);
    const r = await rl("big", 1, year);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(365 * 24 * 3600);
  });

  // KNOWN BUG (reported): NaN window -> resetAt NaN, bucket never expires, retryAfter NaN.
  it.fails("windowMs NaN: must not block forever (expected: recovers or at least finite retryAfter)", async () => {
    const clock = fakeClock();
    const rl = createRateLimiter({ now: clock.now });
    await rl("nan", 1, NaN);
    const r = await rl("nan", 1, NaN);
    // Robust behaviour: retryAfter is a finite number
    expect(Number.isFinite(r.retryAfter)).toBe(true);
  });

  it("windowMs 0: window is already over once the clock moves 1ms", async () => {
    const clock = fakeClock();
    const rl = createRateLimiter({ now: clock.now });
    expect((await rl("w0", 1, 0)).ok).toBe(true);
    clock.advance(1);
    expect((await rl("w0", 1, 0)).ok).toBe(true);
  });
});

describe("window boundaries (redis)", () => {
  it("new counter exactly at the window boundary, old one one ms before", async () => {
    const clock = fakeClock(179_999);
    const { redis, store } = fakeRedis();
    const rl = createRateLimiter({ redis, now: clock.now });
    expect((await rl("k", 1, 60_000)).ok).toBe(true);
    const blocked = await rl("k", 1, 60_000);
    expect(blocked).toEqual({ ok: false, retryAfter: 1 });
    clock.set(180_000);
    expect((await rl("k", 1, 60_000)).ok).toBe(true);
    expect(Array.from(store.keys()).sort()).toEqual(["rl:k:120000", "rl:k:180000"]);
  });

  it("retryAfter is never below 1 even at the last millisecond", async () => {
    const clock = fakeClock(179_999);
    const { redis } = fakeRedis();
    const rl = createRateLimiter({ redis, now: clock.now });
    await rl("k", 1, 60_000);
    expect((await rl("k", 1, 60_000)).retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("windowMs <= 0 skips redis and uses memory", async () => {
    const evalFn = vi.fn();
    const rl = createRateLimiter({ redis: { eval: evalFn }, now: fakeClock().now });
    await rl("k", 1, 0);
    await rl("k", 1, -10);
    expect(evalFn).not.toHaveBeenCalled();
  });

  it("windowMs NaN with redis: result is still well-formed", async () => {
    const { redis } = fakeRedis();
    const rl = createRateLimiter({ redis, now: fakeClock().now });
    const r = await rl("k", 1, NaN);
    expect(typeof r.ok).toBe("boolean");
    expect(Number.isFinite(r.retryAfter)).toBe(true);
  });
});

describe("concurrency", () => {
  it("20 parallel calls, limit 5 -> exactly 5 ok (memory)", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    const rs = await Promise.all(Array.from({ length: 20 }, () => rl("c", 5, 60_000)));
    expect(rs.filter((r) => r.ok)).toHaveLength(5);
  });

  it("20 parallel calls, limit 5 -> exactly 5 ok (fake redis)", async () => {
    const { redis } = fakeRedis();
    const rl = createRateLimiter({ redis, now: fakeClock(120_000).now });
    const rs = await Promise.all(Array.from({ length: 20 }, () => rl("c", 5, 60_000)));
    expect(rs.filter((r) => r.ok)).toHaveLength(5);
  });

  it("20 parallel calls with redis failing -> exactly 5 ok via fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const redis: RedisLike = { eval: async () => { throw new Error("down"); } };
    const rl = createRateLimiter({ redis, now: fakeClock().now });
    const rs = await Promise.all(Array.from({ length: 20 }, () => rl("c", 5, 60_000)));
    expect(rs.filter((r) => r.ok)).toHaveLength(5);
  });
});

describe("malformed redis replies fall back to memory", () => {
  for (const [name, reply] of [
    ["undefined", undefined],
    ["non-numeric string", "abc"],
    ["NaN", NaN],
    ["object", { a: 1 }],
  ] as const) {
    it(`reply ${name}`, async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const redis: RedisLike = { eval: async () => reply };
      const rl = createRateLimiter({ redis, now: fakeClock().now });
      expect((await rl("m", 1, 60_000)).ok).toBe(true);
      expect((await rl("m", 1, 60_000)).ok).toBe(false);
      expect(warn).toHaveBeenCalled();
    });
  }

  it("numeric string reply is accepted", async () => {
    const redis: RedisLike = { eval: async () => "7" };
    const rl = createRateLimiter({ redis, now: fakeClock().now });
    expect((await rl("m", 5, 60_000)).ok).toBe(false);
    expect((await rl("m", 10, 60_000)).ok).toBe(true);
  });

  // Finding: Number(null) === 0 and Number("") === 0 are finite, so these
  // are treated as "count 0" -> allowed, with no fallback. Fail-open.
  // KNOWN BUG (reported): Number(null) === 0 is finite -> treated as count 0, allowed, no fallback (fail-open).
  it.fails("null reply must not be treated as a valid count (fail-open check)", async () => {
    const redis: RedisLike = { eval: async () => null };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rl = createRateLimiter({ redis, now: fakeClock().now });
    await rl("m", 1, 60_000);
    expect(warn).toHaveBeenCalled();
  });
});

describe("redis hang with fake timers", () => {
  it("falls back after the timeout and clears the timer", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const redis: RedisLike = { eval: () => new Promise(() => {}) };
    const rl = createRateLimiter({ redis, redisTimeoutMs: 1000 });
    const p = rl("h", 1, 60_000);
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
    expect((await p).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("no pending timer after a fast redis reply", async () => {
    vi.useFakeTimers();
    const { redis } = fakeRedis();
    const rl = createRateLimiter({ redis, redisTimeoutMs: 1000 });
    await rl("h", 1, 60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("redis that throws synchronously falls back", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const redis: RedisLike = { eval: () => { throw new Error("sync"); } };
    const rl = createRateLimiter({ redis, now: fakeClock().now });
    expect((await rl("s", 1, 60_000)).ok).toBe(true);
  });

  it("redis factory that throws falls back to memory", async () => {
    const rl = createRateLimiter({ redis: () => { throw new Error("factory"); }, now: fakeClock().now });
    expect((await rl("s", 1, 60_000)).ok).toBe(true);
    expect((await rl("s", 1, 60_000)).ok).toBe(false);
  });
});

describe("memory cleanup", () => {
  it("evicts expired buckets once over 10,000 and keeps live ones", async () => {
    const clock = fakeClock();
    const rl = createRateLimiter({ now: clock.now });
    for (let i = 0; i < 10_001; i++) await rl(`old:${i}`, 1, 1000);
    await rl("live", 1, 10_000_000);
    clock.advance(2000);
    // triggers cleanup (size > 10000); old ones are expired, so re-hitting is a fresh window
    expect((await rl("old:0", 1, 1000)).ok).toBe(true);
    expect((await rl("live", 1, 10_000_000)).ok).toBe(false); // live bucket survived
    // an expired bucket re-created -> allowed once, then blocked
    expect((await rl("old:0", 1, 1000)).ok).toBe(false);
  });

  it("does not evict unexpired buckets even when over 10,000", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    for (let i = 0; i < 10_050; i++) await rl(`k:${i}`, 1, 60_000);
    expect((await rl("k:0", 1, 60_000)).ok).toBe(false);
  });
});

describe("key collisions", () => {
  it("memory: keys with colons are distinct strings (no collision)", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    expect((await rl("a:b", 1, 60_000)).ok).toBe(true);
    expect((await rl("a", 1, 60_000)).ok).toBe(true);
    expect((await rl("b:c", 1, 60_000)).ok).toBe(true);
  });

  it("redis: window suffix cannot make two distinct (key, window) pairs collide in practice", async () => {
    // rl:<key>:<windowStart>: key "a:1000" window 2000 -> "rl:a:1000:2000";
    // key "a" window ... would be "rl:a:<digits>" (no extra colon), so distinct.
    const { redis, store } = fakeRedis();
    const rl = createRateLimiter({ redis, now: fakeClock(120_000).now });
    await rl("a:120000", 1, 60_000);
    await rl("a", 1, 60_000);
    expect(Array.from(store.keys()).sort()).toEqual(["rl:a:120000", "rl:a:120000:120000"]);
  });

  it("special characters, unicode, newlines, empty and very long keys", async () => {
    const { redis, store } = fakeRedis();
    const rl = createRateLimiter({ redis, now: fakeClock(120_000).now });
    const keys = ["", " ", "a\nb", "ünï💥", "x".repeat(10_000), "*[]{}", "rl:rl:"];
    for (const k of keys) expect((await rl(k, 1, 60_000)).ok).toBe(true);
    expect(store.size).toBe(keys.length);
  });

  it("login keys are per-lowercased-email by construction (same key for mixed case)", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    const k = (e: string) => `login:${e.toLowerCase()}`;
    await rl(k("A@B.com"), 1, 60_000);
    expect((await rl(k("a@b.COM"), 1, 60_000)).ok).toBe(false);
  });
});

describe("clientIp", () => {
  const ip = (h: Record<string, string>) => clientIp(new Request("http://x", { headers: h }));

  it("takes the first (client-supplied, spoofable) entry and trims whitespace", () => {
    expect(ip({ "x-forwarded-for": "  1.1.1.1 ,  2.2.2.2 ,3.3.3.3" })).toBe("1.1.1.1");
  });
  it("IPv6", () => {
    expect(ip({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" })).toBe("2001:db8::1");
    expect(ip({ "x-real-ip": "::1" })).toBe("::1");
  });
  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(ip({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "9.9.9.9" })).toBe("1.1.1.1");
  });
  it("no headers -> unknown", () => {
    expect(ip({})).toBe("unknown");
  });
  it("empty / whitespace-only x-forwarded-for yields unknown", () => {
    expect(ip({ "x-forwarded-for": "" })).toBe("unknown");
    expect(ip({ "x-forwarded-for": "   " })).toBe("unknown");
  });
  // KNOWN BUG (reported): a leading comma gives "" -> shared empty-string bucket instead of a sane fallback.
  it.fails("leading comma in x-forwarded-for does not yield an empty key", () => {
    expect(ip({ "x-forwarded-for": ",1.2.3.4" })).not.toBe("");
  });
  it("spoofing: each distinct leading value is a different bucket (known limitation)", () => {
    expect(ip({ "x-forwarded-for": "6.6.6.6, 1.1.1.1" })).not.toBe(ip({ "x-forwarded-for": "7.7.7.7, 1.1.1.1" }));
  });
});

describe("fallback logging does not leak", () => {
  it("logs only a generic message; the limiter never adds the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Note: err.message from the Redis client is passed through verbatim (observation, see report).
    const redis2: RedisLike = { eval: async () => { throw new Error("plain"); } };
    const rl2 = createRateLimiter({ redis: redis2, now: fakeClock().now });
    warn.mockClear();
    await rl2("login:victim@example.com", 1, 60_000);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("victim");
  });
});

describe("import safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });

  it("imports without crashing and without constructing Redis when env vars are unset", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const ctor = vi.fn();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({ Redis: ctor }));
    const mod = await import("@/lib/ratelimit");
    expect(typeof mod.rateLimit).toBe("function");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("only URL set (no token) stays in-memory", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const ctor = vi.fn();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({ Redis: ctor }));
    const mod = await import("@/lib/ratelimit");
    await mod.rateLimit(`only-url:${Math.random()}`, 1, 60_000);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("only token set (no URL) stays in-memory", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    const ctor = vi.fn();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({ Redis: ctor }));
    const mod = await import("@/lib/ratelimit");
    await mod.rateLimit(`only-tok:${Math.random()}`, 1, 60_000);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("a throwing Redis constructor falls back to memory instead of throwing", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctor = vi.fn(function () { throw new Error("bad config"); });
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({ Redis: ctor }));
    const mod = await import("@/lib/ratelimit");
    const k = `ctor-throw:${Math.random()}`;
    expect((await mod.rateLimit(k, 1, 60_000)).ok).toBe(true);
    expect((await mod.rateLimit(k, 1, 60_000)).ok).toBe(false);
  });
});
