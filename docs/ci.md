# Continuous integration

Workflow: `.github/workflows/ci.yml`. Runs on every pull request and on every push to `main`. A newer push to the same pull request cancels the older run. It uses no repository secrets and does not deploy.

## What runs (job `checks`, Ubuntu, Node 22, 20 minute limit)

| Step | Why |
|---|---|
| `npm ci` | Clean install exactly from `package-lock.json` |
| `npx prisma generate` | Builds the typed client the code imports |
| `npx prisma migrate deploy` | Applies all migrations to an empty throwaway Postgres 16 (`calvy_ci`); proves they work from scratch. Never `db push`. |
| `npx prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma --exit-code` | Fails if `schema.prisma` changed without a migration |
| `npm run lint` | ESLint via `next lint` |
| `npx tsc --noEmit` | Type check |
| `npm test` | Vitest unit tests |
| `npm run build` | Production build (`prisma generate && next build`) |
| `npm audit --omit=dev --audit-level=high` | Informational only (`continue-on-error`). `next` has a known advisory that cannot be fixed on Next.js 14; make it blocking after the Next.js 15/16 migration (S1-28). |

Playwright smoke tests are not in CI yet (they need seeded data and a running server). A commented-out placeholder job is in the workflow.

## Reproduce locally (PowerShell)

```powershell
cd C:\Users\qadri\calvy-v2
npm ci
npx prisma generate
npm run lint
npx tsc --noEmit
npm test
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/calvy_ci"
$env:NEXTAUTH_SECRET="ci-dummy-secret-not-for-real-use"
$env:NEXTAUTH_URL="http://localhost:3000"
$env:NEXT_PUBLIC_APP_URL="http://localhost:3000"
$env:NEXT_PUBLIC_ROOT_DOMAIN="localhost"
$env:RAZORPAY_KEY_ID="rzp_test_dummy"
$env:RAZORPAY_KEY_SECRET="dummy"
$env:RESEND_API_KEY="re_dummy"
npm run build
```

The migration steps need a throwaway local Postgres (for example Docker: `docker run --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=calvy_ci -p 5432:5432 postgres:16`). Never point `DATABASE_URL` at the dev or production database when running `migrate deploy`.

## When a step fails

- `migrate deploy`: a migration SQL error. Fix forward with a new migration; never edit a merged one. Also check `.gitattributes` kept LF endings.
- `migrate diff`: the schema and migrations disagree. Run `npm run db:migrate -- --name <name>` locally and commit the generated folder.
- `lint` / `tsc` / `test`: run the same command locally and fix the reported file.
- `build`: usually a type or import error, or code reading an environment variable at import time. Reproduce with the dummy variables above.
- Audit: informational; read the output but it does not fail the run.

## Dummy variables

All set at job level in the workflow, none real.

| Variable | Value | Can be removed when |
|---|---|---|
| `DATABASE_URL` | throwaway CI Postgres | never (migrations and build need it) |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | dummy | when the config module supplies safe defaults for CI |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ROOT_DOMAIN` | localhost | same |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY` | dummy | after the lazy third-party client fix (clients created inside functions) is merged |
