# Notifications scheduler: setup steps (owner)

Do this once chunk 1 (`/api/cron/notifications`) is merged and deployed. Vercel Hobby only allows a daily cron, so cron-job.org triggers the endpoint every 2 minutes.

Since chunk 4 this one endpoint does all scheduled work: it expires unpaid holds, queues booking reminders that are due (one or two per booking, 24h before by default), then sends. The old `/api/cron/reminders` route is gone; if any external job still calls it, point it at `/api/cron/notifications`. `vercel.json` keeps one daily Vercel cron on `/api/cron/notifications` as the backstop. Without the cron-job.org job, reminders go out at most once a day, so a 2h reminder can be missed.

## 1. Vercel: bypass secret
1. Vercel → the Calvy project → **Settings → Deployment Protection → Protection Bypass for Automation**.
2. Create a secret (name it `cron-job.org`) and copy its value. You paste it into cron-job.org in step 3. Your app does not need it in an env var.

Revoking this secret stops the scheduler until you paste a new one into cron-job.org.

## 2. Vercel: our own secret
1. Generate a value in the terminal:
   ```zsh
   openssl rand -base64 32
   ```
2. Vercel → **Settings → Environment Variables**: add `CRON_SECRET` with that value for the environment you are scheduling (Production). If `CRON_SECRET` already exists, reuse its value and do not change it: the daily Vercel crons use it too.
3. **Redeploy**: env vars only reach new deployments.

## 3. cron-job.org: the job
Create a free account, then **Cronjobs → Create cronjob**:

| Field | Value |
|---|---|
| Title | `Calvy notifications` |
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
Expected: JSON such as `{"ok":true,"expiredHolds":0,"remindersQueued":0,"claimed":0,"sent":0,"retried":0,"failed":0,"skipped":0,"reclaimedDead":0,"purged":0}`.

| You get | Meaning |
|---|---|
| 401 with a Vercel HTML page | Bypass secret wrong or missing |
| 401 with `{"error":"Unauthorized"}` | Bypass fine; `CRON_SECRET` wrong, or not redeployed after adding it |
| 3xx | Use the final domain in the URL |
| 404 | Chunk 1 is not on this deployment yet |
| `-1` in `expiredHolds` or `remindersQueued` | That step failed this run (see the Vercel logs); sending still ran |

## Later
- **Encryption key (optional):** reset and verify links wait in the outbox encrypted, and unsubscribe links are signed, with `NOTIFY_SECRET_KEY` if you set it (same way as step 2: Production, then redeploy) and otherwise with a key derived from `NEXTAUTH_SECRET`, so nothing breaks if you never set it. Changing either secret while such emails are pending makes those few fail; unsubscribe links already sent stop working.
- **Pro plan:** Vercel crons can then run every minute. Set `*/2 * * * *` in `vercel.json` and delete the cron-job.org job.
