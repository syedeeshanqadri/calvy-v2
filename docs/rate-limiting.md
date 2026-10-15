# Rate limiting (S1-12)

Code: `lib/ratelimit.ts`. Contract:

```ts
const { ok, retryAfter } = await rateLimit(key, limit, windowMs);
```

`rateLimit` is async. Every caller must `await` it; without the `await`, `rl.ok` is a type error, so `npx tsc --noEmit` catches a missed one.

## How it works

- **Redis (shared across serverless instances)** when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Fixed window: key `rl:<key>:<windowStart>` where `windowStart = floor(now / windowMs) * windowMs`. A small Lua script does `INCR` and, on the first hit, `PEXPIRE` atomically. `ok = count <= limit`; `retryAfter` = whole seconds to the end of the window (minimum 1).
- **In-memory fallback** when the variables are not set (local dev, tests). Per process, resets on cold start, best effort. The map is capped at 50,000 buckets (oldest evicted first) and expired entries are swept at most once a minute.
- **Until Redis is configured (planned for Step 7), limits are per-instance and advisory on serverless.** In production without the Upstash variables, one warning per process is logged (variable names only).
- **Redis failure**: if the Redis call throws, times out (1 s) or returns something other than a finite integer (or digit string), that call uses the in-memory limiter, so outages never lock users out of login. The first failure of a streak logs one warning (error message only, never keys, URL or token).
- **Circuit breaker**: after 3 consecutive Redis failures the limiter skips Redis for 30 s (no 1 s stall per request) and logs one warning. After the pause one probe call is tried (half-open); success closes the breaker and logs one info line, failure pauses another 30 s silently. State is per limiter instance (the default `rateLimit` is one instance per process).
- **Key hygiene**: keys longer than 200 characters have the part after the `prefix:` replaced by its SHA-256 hex; memory and Redis use the same normalised key.
- **Invalid arguments**: a non-finite `limit` or `windowMs` (NaN, Infinity) logs one warning and the call is allowed (fail open); it never throws. `windowMs <= 0` uses the in-memory path. Memory-path `retryAfter` is always an integer >= 1 when blocked.
- The Redis client is created lazily on first use, never at import, so missing env never crashes a route or page.
- `createRateLimiter({ redis?, now?, redisTimeoutMs? })` is exported for tests (inject a fake Redis and a fake clock).

## Environment variables

| Variable | Notes |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |

Redis is activated in Step 7 (set both in Vercel). Locally nothing is needed.

## Limits per route

| Route | Key | Limit |
| --- | --- | --- |
| `POST /api/leads` | IP | 5 / min |
| `POST /api/signup` | IP | 5 / min |
| `POST /api/bookings` | IP | 10 / min |
| NextAuth credentials login (`lib/auth.ts`) | lowercased email | 10 / min |
| `POST /api/upload` | `businessId` (session) | 10 / min |
| `POST /api/support` (create ticket) | `businessId` (session) | 20 / min (shared with next row) |
| `POST /api/support/[id]` (message) | `businessId` (session) | 20 / min (shared counter `support:<businessId>`) |
| `GET /api/availability` (added by package B1) | IP | 60 / min |
| `POST /api/broadcasts/send` (added by package B1) | see B1 | see B1 |

429 responses are JSON `{ error }` with a `Retry-After` header (seconds).

## Client IP

`clientIp(req)` order: `x-vercel-forwarded-for`, then the first non-empty entry of `x-forwarded-for` that parses as an IPv4 or IPv6 address (empty or garbage entries are skipped), then a valid `x-real-ip`, else `"unknown"` (a shared bucket for all such requests).

**Trust caveat.** This is only trustworthy behind Vercel's edge, which sets these headers itself. On preview deployments, with a custom proxy, or when the app is reachable directly, a client can send its own `x-forwarded-for` and evade or spoof per-IP limits. If a CDN or proxy is ever put in front of Vercel, re-check which header carries the real client IP before relying on per-IP limits.

## Fixed-window caveat

A client can burst up to 2x the limit across a window boundary. Acceptable for abuse mitigation.

## Testing

- Unit: `npx vitest run tests/ratelimit.test.ts` (fake clock, fake Redis, failure fallback, lazy construction, `clientIp`).
- Manual: with the dev server running and no Upstash variables, POST to `/api/leads` six times within a minute; the 6th returns 429 with `Retry-After`.
