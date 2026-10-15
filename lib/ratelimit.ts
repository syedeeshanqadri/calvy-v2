// Shared rate limiter.
//
// With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, counters live in
// Redis (fixed window, atomic INCR + PEXPIRE) so limits hold across serverless
// instances. Without them, or if Redis errors / times out, an in-memory limiter
// is used (per instance, best effort). See docs/rate-limiting.md.

import { Redis } from "@upstash/redis";

export type RateLimitResult = { ok: boolean; retryAfter: number };

/** Minimal Redis surface we need (lets tests inject a fake). */
export interface RedisLike {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export interface RateLimiterOptions {
  /** Redis client, or a function that lazily returns one (or undefined for none). */
  redis?: RedisLike | (() => RedisLike | undefined);
  now?: () => number;
  /** Redis call timeout in ms (default 1000). */
  redisTimeoutMs?: number;
}

type Bucket = { count: number; resetAt: number };

// Redis EVAL (server-side Lua, not JS eval). The script is a constant; user
// input only reaches it as KEYS/ARGV values, never as script text.
// INCR and PEXPIRE in one atomic script; expiry is set only on the first hit.
const INCR_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end " +
  "return c";

export function createRateLimiter(opts: RateLimiterOptions = {}) {
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.redisTimeoutMs ?? 1000;
  const buckets = new Map<string, Bucket>();

  function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const t = now();

    // Opportunistic cleanup so the map doesn't grow unbounded.
    if (buckets.size > 10_000) {
      buckets.forEach((b, k) => {
        if (t > b.resetAt) buckets.delete(k);
      });
    }

    const b = buckets.get(key);
    if (!b || t > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: t + windowMs });
      return { ok: true, retryAfter: 0 };
    }
    if (b.count >= limit) {
      return { ok: false, retryAfter: Math.ceil((b.resetAt - t) / 1000) };
    }
    b.count++;
    return { ok: true, retryAfter: 0 };
  }

  function getRedis(): RedisLike | undefined {
    const r = opts.redis;
    return typeof r === "function" ? r() : r;
  }

  async function redisLimit(
    redis: RedisLike,
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const t = now();
    const windowStart = Math.floor(t / windowMs) * windowMs;
    const windowEnd = windowStart + windowMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const count = await Promise.race([
        redis.eval(INCR_SCRIPT, [`rl:${key}:${windowStart}`], [String(windowMs)]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("redis timeout")), timeoutMs);
        }),
      ]);
      const n = Number(count);
      if (!Number.isFinite(n)) throw new Error("unexpected redis reply");
      if (n <= limit) return { ok: true, retryAfter: 0 };
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowEnd - t) / 1000)) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return async function rateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    let redis: RedisLike | undefined;
    try {
      redis = getRedis();
    } catch {
      redis = undefined;
    }
    if (!redis || windowMs <= 0) return memoryLimit(key, limit, windowMs);
    try {
      return await redisLimit(redis, key, limit, windowMs);
    } catch (err) {
      console.warn(
        "[ratelimit] Redis unavailable, falling back to in-memory limiter:",
        err instanceof Error ? err.message : "unknown error",
      );
      return memoryLimit(key, limit, windowMs);
    }
  };
}

let cachedRedis: Redis | undefined;

// Built lazily on first use; never at import time.
function defaultRedis(): RedisLike | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  if (!cachedRedis) cachedRedis = new Redis({ url, token, retry: false });
  const client = cachedRedis;
  return {
    eval: (script, keys, args) => client.eval(script, keys, args),
  };
}

export const rateLimit = createRateLimiter({ redis: defaultRedis });

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
