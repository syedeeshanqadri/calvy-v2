# Notifications scheduler: setup steps (owner)

Do this once chunk 1 (`/api/cron/notifications`) is merged and deployed. Vercel Hobby only allows a daily cron, so cron-job.org triggers the endpoint every 2 minutes.

Since chunk 4 this one endpoint does all scheduled work: it expires unpaid holds, queues booking reminders that are due (one or two per booking, 24h before by default) and opted-in morning summaries (08:00 to 12:00 business time), then sends. The old `/api/cron/reminders` route is gone; if any external job still calls it, point it at `/api/cron/notifications`. `vercel.json` keeps one daily Vercel cron on `/api/cron/notifications` as the backstop. Without the cron-job.org job, reminders go out at most once a day, so a 2h reminder can be missed.

## Current setup (configured 2026-11-03)

| What | Where | State |
|---|---|---|
| Vercel project | `q3labs/calvy-v2`, production domain `calvy-v2.vercel.app` | Deployment Protection (Vercel Authentication) is on for **all** deployments, production included |
| `CRON_SECRET` | Vercel env, Production + Preview, Sensitive | Rotated 2026-11-03 (the old value was Sensitive and could not be read back); 64 hex chars |
| `NOTIFY_SECRET_KEY` | Vercel env, Production + Preview, Sensitive | Added 2026-11-03; 64 hex chars |
| Protection Bypass for Automation | Vercel → Settings → Deployment Protection | One secret, note `cron-job.org` (created through the Vercel API) |
| cron-job.org job | Title `calvy-v2 notifications`, **job ID `8782530`** | `GET https://calvy-v2.vercel.app/api/cron/notifications`, minutes `*/2` UTC, headers `Authorization: Bearer <CRON_SECRET>` + `x-vercel-protection-bypass: <bypass>`, 30s timeout, email on failure and on auto-disable |

Verified 2026-11-03 after the production redeploy: with both headers → 200 and the JSON summary; with the bypass only → 401 `{"error":"Unauthorized"}`; with no headers → 302 to Vercel's login (Deployment Protection answers before the app); the first scheduled cron-job.org run → 200; the run shows in the Vercel function logs.

No secret value is stored in this repo. To change one: rotate it in Vercel, redeploy, then edit job `8782530`'s headers on cron-job.org (or via its API with `CRONJOB_ORG_API_KEY`). Since `NOTIFY_SECRET_KEY` is now set, rotating it breaks reset/verify emails still waiting in the outbox and unsubscribe links already sent.

The steps below are how this was done, for redoing it by hand.

## 1. Vercel: bypass secret
1. Vercel → the Calvy project → **Settings → Deployment Protection → Protection Bypass for Automation**.
2. Create a secret (name it `cron-job.org`) and copy its value. You paste it into cron-job.org in step 3. Your app does not need it in an env var.

Revoking this secret stops the scheduler until you paste a new one into cron-job.org.

## 2. Vercel: our own secret
1. Generate a value in the terminal:
   ```zsh
   openssl rand -hex 32
   ```
2. Vercel → **Settings → Environment Variables**: add `CRON_SECRET` with that value for the environment you are scheduling (Production). If `CRON_SECRET` already exists, reuse its value and do not change it: the daily Vercel crons use it too.
3. **Redeploy**: env vars only reach new deployments.

## 3. cron-job.org: the job
Create a free account, then **Cronjobs → Create cronjob**:

| Field | Value |
|---|---|
| Title | `calvy-v2 notifications` |
| URL | `https://<your-production-domain>/api/cron/notifications` (the exact domain from Vercel → Settings → Domains; a redirecting domain can break the call) |
| Schedule | Every 2 minutes (custom: minutes `*/2`, all else every) |
| Request method (Advanced tab) | `GET` |
| Header 1 (Advanced tab) | `Authorization` = `Bearer <CRON_SECRET value>` |
| Header 2 (Advanced tab) | `x-vercel-protection-bypass` = `<bypass secret from step 1>` |
| Notifications | On, for failed runs |

Save, then use **Test run**. cron-job.org closes the connection at 30 seconds; each run stops itself at 25.

## 4. Check it from the terminal
```zsh
curl -sS "https://<your-production-domain>/api/cron/notifications" -H "Authorization: Bearer <CRON_SECRET value>" -H "x-vercel-protection-bypass: <bypass secret>"
```
Expected: JSON such as `{"ok":true,"expiredHolds":0,"remindersQueued":0,"summariesQueued":0,"claimed":0,"sent":0,"retried":0,"failed":0,"skipped":0,"reclaimedDead":0,"purged":0}`.

| You get | Meaning |
|---|---|
| 401 with a Vercel HTML page | Bypass secret wrong or missing |
| 401 with `{"error":"Unauthorized"}` | Bypass fine; `CRON_SECRET` wrong, or not redeployed after adding it |
| 3xx | Use the final domain in the URL |
| 404 | Chunk 1 is not on this deployment yet |
| `-1` in `expiredHolds`, `remindersQueued` or `summariesQueued` | That step failed this run (see the Vercel logs); sending still ran |

## Later
- **Encryption key (optional):** reset and verify links wait in the outbox encrypted, and unsubscribe links are signed, with `NOTIFY_SECRET_KEY` if you set it (same way as step 2: Production, then redeploy) and otherwise with a key derived from `NEXTAUTH_SECRET`, so nothing breaks if you never set it. Changing either secret while such emails are pending makes those few fail; unsubscribe links already sent stop working.
- **Pro plan:** Vercel crons can then run every minute. Set `*/2 * * * *` in `vercel.json` and delete the cron-job.org job.
