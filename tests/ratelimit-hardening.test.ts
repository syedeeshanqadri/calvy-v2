import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { createRateLimiter, clientIp, normalizeKey, type RedisLike } from "@/lib/ratelimit";

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("circuit breaker", () => {
  const failing = () => {
    const evalFn = vi.fn(async () => {
      throw new Error("down");
    });
    return { redis: { eval: evalFn } as RedisLike, evalFn };
  };

  it("opens after 3 consecutive failures, skips redis for 30s, warns twice in total", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { redis, evalFn } = failing();
    const rl = createRateLimiter({ redis, now: fakeClock().now });
    for (let i = 0; i < 10; i++) await rl(`k${i}`, 5, 60_000);
    expect(evalFn).toHaveBeenCalledTimes(3);
    // one for the first failure of the streak, one when the breaker opens
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("half-open probe after the pause; success closes it and logs one info", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const clock = fakeClock();
    let down = true;
    const evalFn = vi.fn(async () => {
      if (down) throw new Error("down");
      return 1;
    });
    const rl = createRateLimiter({ redis: { eval: evalFn }, now: clock.now });
    for (let i = 0; i < 3; i++) await rl("k", 5, 60_000);
    clock.advance(29_999);
    await rl("k", 5, 60_000);
    expect(evalFn).toHaveBeenCalledTimes(3);
    clock.advance(1);
    down = false;
    await rl("k", 5, 60_000); // probe succeeds
    await rl("k", 5, 60_000); // normal redis call again
    expect(evalFn).toHaveBeenCalledTimes(5);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("a failed probe re-opens the breaker for another 30s without a new warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const clock = fakeClock();
    const { redis, evalFn } = failing();
    const rl = createRateLimiter({ redis, now: clock.now });
    for (let i = 0; i < 3; i++) await rl("k", 5, 60_000);
    const warns = warn.mock.calls.length;
    clock.advance(30_000);
    await rl("k", 5, 60_000); // probe, fails
    await rl("k", 5, 60_000); // skipped
    expect(evalFn).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(warns);
  });

  it("a success resets the consecutive-failure count", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let fail = true;
    const evalFn = vi.fn(async () => {
      if (fail) throw new Error("x");
      return 1;
    });
    const rl = createRateLimiter({ redis: { eval: evalFn }, now: fakeClock().now });
    await rl("k", 5, 60_000);
    await rl("k", 5, 60_000);
    fail = false;
    await rl("k", 5, 60_000);
    fail = true;
    await rl("k", 5, 60_000);
    await rl("k", 5, 60_000);
    await rl("k", 5, 60_000); // 3rd consecutive after the reset -> opens
    await rl("k", 5, 60_000); // skipped
    expect(evalFn).toHaveBeenCalledTimes(6);
  });
});

describe("memory cap and sweep", () => {
  it("caps at 50,000 buckets and evicts the oldest first", async () => {
    const rl = createRateLimiter({ now: fakeClock().now });
    for (let i = 0; i < 50_005; i++) await rl(`k:${i}`, 1, 600_000);
    expect((await rl("k:50004", 1, 600_000)).ok).toBe(false); // newest kept
    expect((await rl("k:0", 1, 600_000)).ok).toBe(true); // oldest was evicted
  });

  it("expired entries are swept and the limiter keeps working", async () => {
    const clock = fakeClock();
    const rl = createRateLimiter({ now: clock.now });
    await rl("a", 1, 1000);
    clock.advance(61_000);
    expect((await rl("b", 1, 1000)).ok).toBe(true); // triggers the sweep
    expect((await rl("a", 1, 1000)).ok).toBe(true); // a was swept or expired: fresh
  });
});

describe("key hygiene", () => {
  it("keeps short keys and hashes the variable part of long ones", () => {
    expect(normalizeKey("login:a@b.com")).toBe("login:a@b.com");
    const long = "x".repeat(5000) + "@example.com";
    const out = normalizeKey(`login:${long}`);
    expect(out).toBe(`login:${createHash("sha256").update(long).digest("hex")}`);
    expect(out.length).toBeLessThan(80);
  });

  it("uses the normalised key for redis too", async () => {
    const keys: string[] = [];
    const redis: RedisLike = {
      eval: async (_s, k) => {
        keys.push(k[0]);
        return 1;
      },
    };
    const rl = createRateLimiter({ redis, now: fakeClock(120_000).now });
    await rl(`login:${"y".repeat(10_000)}`, 5, 60_000);
    expect(keys[0].length).toBeLessThan(120);
    expect(keys[0].startsWith("rl:login:")).toBe(true);
  });
});

describe("argument and reply validation", () => {
  it("non-finite limit or window fails open and never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const rl = createRateLimiter({ now: fakeClock().now });
    expect(await rl("k", NaN, 60_000)).toEqual({ ok: true, retryAfter: 0 });
    expect(await rl("k", 1, Infinity)).toEqual({ ok: true, retryAfter: 0 });
  });

  it("null and empty-string replies are failures, not counts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const reply of [null, ""]) {
      const rl = createRateLimiter({ redis: { eval: async () => reply }, now: fakeClock().now });
      expect((await rl("m", 1, 60_000)).ok).toBe(true);
      expect((await rl("m", 1, 60_000)).ok).toBe(false); // memory fallback enforces
    }
  });
});

describe("production without Redis", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("warns once per process, naming only the variables", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const mod = await import("@/lib/ratelimit");
    await mod.rateLimit("a", 5, 60_000);
    await mod.rateLimit("b", 5, 60_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("does not warn outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const mod = await import("@/lib/ratelimit");
    await mod.rateLimit("a", 5, 60_000);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("clientIp hardening", () => {
  const ip = (h: Record<string, string>) => clientIp(new Request("http://x", { headers: h }));

  it("prefers x-vercel-forwarded-for", () => {
    expect(ip({ "x-vercel-forwarded-for": "8.8.8.8", "x-forwarded-for": "1.1.1.1" })).toBe("8.8.8.8");
  });

  it("skips empty and invalid entries", () => {
    expect(ip({ "x-forwarded-for": ",1.2.3.4" })).toBe("1.2.3.4");
    expect(ip({ "x-forwarded-for": "garbage, 999.1.1.1, 5.6.7.8" })).toBe("5.6.7.8");
    expect(ip({ "x-forwarded-for": "garbage", "x-real-ip": "9.9.9.9" })).toBe("9.9.9.9");
    expect(ip({ "x-forwarded-for": "," })).toBe("unknown");
  });
});
