# Rate limiting (S1-12)

Code: `lib/ratelimit.ts`. Contract:

```ts
const { ok, retryAfter } = await rateLimit(key, limit, windowMs);
```

`rateLimit` is async. Every caller must `await` it; without the `await`, `rl.ok` is a type error, so `npx tsc --noEmit` catches a missed one.

## How it works

- **Redis (shared across serverless instances)** when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Fixed window: key `rl:<key>:<windowStart>` where `windowStart = floor(now / windowMs) * windowMs`. A small Lua script does `INCR` and, on the first hit, `PEXPIRE` atomically. `ok = count <= limit`; `retryAfter` = whole seconds to the end of the window (minimum 1).
- **In-memory fallback** when the variables are not set (local dev, tests). Per process, resets on cold start, best effort. Same semantics as before, with opportunistic cleanup above 10,000 keys.
- **Redis failure**: if the Redis call throws or takes longer than 1 s, one warning is logged (error message only, never the key, URL or token) and that call uses the in-memory limiter. Redis outages fail open to in-memory, so they never lock users out of login.
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

`clientIp(req)` takes the first entry of `x-forwarded-for`, then `x-real-ip`, then `"unknown"`. On Vercel the platform sets `x-forwarded-for` itself, so the first entry is trustworthy. Behind any other proxy, or when the app is reachable directly, a client can send its own `x-forwarded-for` and evade or spoof per-IP limits. All requests with no usable header share the `"unknown"` bucket.

## Fixed-window caveat

A client can burst up to 2x the limit across a window boundary. Acceptable for abuse mitigation.

## Testing

- Unit: `npx vitest run tests/ratelimit.test.ts` (fake clock, fake Redis, failure fallback, lazy construction, `clientIp`).
- Manual: with the dev server running and no Upstash variables, POST to `/api/leads` six times within a minute; the 6th returns 429 with `Retry-After`.
