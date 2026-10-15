// Shared rate limiter.
//
// With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, counters live in
// Redis (fixed window, atomic INCR + PEXPIRE) so limits hold across serverless
// instances. Without them, or if Redis errors / times out, an in-memory limiter
// is used (per instance, best effort). See docs/rate-limiting.md.

import { createHash } from "node:crypto";
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

const MAX_BUCKETS = 50_000;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_KEY_LENGTH = 200;
const BREAKER_THRESHOLD = 3;
const BREAKER_PAUSE_MS = 30_000;

// Redis EVAL (server-side Lua, not JS eval). The script is a constant; user
// input only reaches it as KEYS/ARGV values, never as script text.
// INCR and PEXPIRE in one atomic script; expiry is set only on the first hit.
const INCR_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end " +
  "return c";

/**
 * Keys longer than 200 chars (e.g. an attacker-supplied email) have their
 * variable part (everything after a short "prefix:") replaced by its SHA-256
 * hex, so they cannot become huge Redis keys. Memory and Redis use the same
 * normalised key.
 */
export function normalizeKey(key: string): string {
  if (key.length <= MAX_KEY_LENGTH) return key;
  const idx = key.indexOf(":");
  const prefix = idx >= 0 && idx <= 32 ? key.slice(0, idx + 1) : "";
  return prefix + createHash("sha256").update(key.slice(prefix.length)).digest("hex");
}

/** Accept only a finite integer, or a string of digits, as the counter. */
function parseCount(reply: unknown): number {
  if (typeof reply === "number" && Number.isFinite(reply) && Number.isInteger(reply)) return reply;
  if (typeof reply === "string" && /^\d{1,15}$/.test(reply)) return Number(reply);
  throw new Error("unexpected redis reply");
}

/**
 * One limiter = one in-memory map + one circuit breaker. The default exported
 * `rateLimit` is a single instance, so its breaker is effectively module-level.
 */
export function createRateLimiter(opts: RateLimiterOptions = {}) {
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.redisTimeoutMs ?? 1000;
  const buckets = new Map<string, Bucket>();
  let lastSweep = now();

  // Circuit breaker state.
  let failures = 0;
  let openUntil = 0; // 0 = closed
  let probing = false; // a half-open probe is in flight
  let warnedInvalid = false;

  function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const t = now();

    // Expired-entry sweep at most once a minute.
    if (t - lastSweep >= SWEEP_INTERVAL_MS) {
      lastSweep = t;
      buckets.forEach((b, k) => {
        if (t > b.resetAt) buckets.delete(k);
      });
    }

    const b = buckets.get(key);
    if (!b || t > b.resetAt) {
      // delete first so a re-created bucket becomes the newest in insertion order
      buckets.delete(key);
      buckets.set(key, { count: 1, resetAt: t + windowMs });
      // Hard cap: evict the oldest entries.
      while (buckets.size > MAX_BUCKETS) {
        const oldest = buckets.keys().next();
        if (oldest.done) break;
        buckets.delete(oldest.value);
      }
      return { ok: true, retryAfter: 0 };
    }
    if (b.count >= limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
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
      const reply = await Promise.race([
        redis.eval(INCR_SCRIPT, [`rl:${key}:${windowStart}`], [String(windowMs)]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("redis timeout")), timeoutMs);
        }),
      ]);
      const n = parseCount(reply);
      if (n <= limit) return { ok: true, retryAfter: 0 };
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowEnd - t) / 1000)) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function recordSuccess() {
    if (openUntil !== 0) console.info("[ratelimit] Redis recovered, shared limiter active again.");
    failures = 0;
    openUntil = 0;
    probing = false;
  }

  function recordFailure(err: unknown, wasProbe: boolean) {
    failures++;
    const msg = err instanceof Error ? err.message : "unknown error";
    if (wasProbe) {
      // half-open probe failed: pause again; we already warned when it first opened
      openUntil = now() + BREAKER_PAUSE_MS;
      probing = false;
    } else if (failures >= BREAKER_THRESHOLD && openUntil === 0) {
      openUntil = now() + BREAKER_PAUSE_MS;
      console.warn(
        `[ratelimit] Redis failed ${failures} times in a row (${msg}); using in-memory limiter for ${BREAKER_PAUSE_MS / 1000}s.`,
      );
    } else if (failures === 1) {
      console.warn("[ratelimit] Redis unavailable, falling back to in-memory limiter:", msg);
    }
  }

  return async function rateLimit(
    rawKey: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    // Invalid arguments (NaN/Infinity): fail open, never throw.
    if (!Number.isFinite(limit) || !Number.isFinite(windowMs)) {
      if (!warnedInvalid) {
        warnedInvalid = true;
        console.warn("[ratelimit] Invalid limit/windowMs (not finite); request allowed.");
      }
      return { ok: true, retryAfter: 0 };
    }
    const key = normalizeKey(String(rawKey));

    let redis: RedisLike | undefined;
    try {
      redis = getRedis();
    } catch {
      redis = undefined;
    }
    if (!redis || windowMs <= 0) return memoryLimit(key, limit, windowMs);

    let wasProbe = false;
    if (openUntil !== 0) {
      if (now() < openUntil || probing) return memoryLimit(key, limit, windowMs);
      probing = true; // half-open: this call is the single probe
      wasProbe = true;
    }
    try {
      const res = await redisLimit(redis, key, limit, windowMs);
      recordSuccess();
      return res;
    } catch (err) {
      recordFailure(err, wasProbe);
      return memoryLimit(key, limit, windowMs);
    }
  };
}

let cachedRedis: Redis | undefined;
let warnedUnconfigured = false;

// Built lazily on first use; never at import time.
function defaultRedis(): RedisLike | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production" && !warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[ratelimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set: rate limits are per-instance and advisory.",
      );
    }
    return undefined;
  }
  if (!cachedRedis) cachedRedis = new Redis({ url, token, retry: false });
  const client = cachedRedis;
  return {
    eval: (script, keys, args) => client.eval(script, keys, args),
  };
}

export const rateLimit = createRateLimiter({ redis: defaultRedis });

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

function looksLikeIp(v: string): boolean {
  if (IPV4.test(v)) return true;
  // Loose IPv6 check (also covers ::ffff:1.2.3.4): hex digits, colons, optional dots.
  return v.length <= 45 && /^[0-9a-f:.]+$/i.test(v) && v.split(":").length >= 3;
}

function firstValidIp(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const v = part.trim();
    if (v && looksLikeIp(v)) return v;
  }
  return undefined;
}

/**
 * Client IP for rate limiting. Only trustworthy behind Vercel's edge, which
 * sets x-vercel-forwarded-for / x-forwarded-for itself. See docs/rate-limiting.md.
 */
export function clientIp(req: Request): string {
  return (
    firstValidIp(req.headers.get("x-vercel-forwarded-for")) ??
    firstValidIp(req.headers.get("x-forwarded-for")) ??
    firstValidIp(req.headers.get("x-real-ip")) ??
    "unknown"
  );
}
